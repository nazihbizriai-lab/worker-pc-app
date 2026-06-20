import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { windowsActionSchema } from "@workcrew/contracts";

export class WindowsAgent {
  private process: ChildProcess | null = null;
  private endpoint: string | null = null;
  private token: string | null = null;
  private healthChecked = false;

  private reset(): void {
    this.process = null;
    this.endpoint = null;
    this.token = null;
    this.healthChecked = false;
  }

  private async start(): Promise<void> {
    if (this.endpoint && this.token) return;
    const executable = process.env.WORKCREW_WINDOWS_AGENT;
    if (!executable) throw new Error("The WorkCrew Windows helper is not installed on this test machine");
    const token = randomBytes(32).toString("hex");
    const child = spawn(executable, ["--host", "127.0.0.1", "--port", "0", "--token", token], {
      windowsHide: true,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });
    // If the helper crashes at any point after launch, clear our internal state
    // so a later execute() call relaunches a fresh process cleanly rather than
    // talking to a dead endpoint.
    child.once("exit", () => {
      if (this.process === child) this.reset();
    });
    let ready: { port: number };
    try {
      ready = await new Promise<{ port: number }>((resolvePromise, reject) => {
        const timeout = setTimeout(() => reject(new Error("Windows helper startup timed out")), 10_000);
        let line = "";
        child.stdout.on("data", (chunk: Buffer) => {
          line += chunk.toString("utf8");
          const newline = line.indexOf("\n");
          if (newline < 0) return;
          clearTimeout(timeout);
          try { resolvePromise(JSON.parse(line.slice(0, newline)) as { port: number }); }
          catch { reject(new Error("Windows helper returned an invalid startup message")); }
        });
        child.once("error", reject);
        child.once("exit", (code) => reject(new Error(`Windows helper stopped during startup with code ${code}`)));
      });
    } catch (error) {
      // Startup failed: make sure no half started child lingers and state is clean.
      child.kill();
      this.reset();
      throw error instanceof Error ? error : new Error("Windows helper failed to start");
    }
    this.process = child;
    this.endpoint = `http://127.0.0.1:${ready.port}`;
    this.token = token;
    this.healthChecked = false;
  }

  private async probeHealth(): Promise<void> {
    if (this.healthChecked) return;
    try {
      const response = await fetch(`${this.endpoint}/health`, {
        method: "GET",
        headers: { authorization: `Bearer ${this.token}` },
        signal: AbortSignal.timeout(5_000)
      });
      const payload = await response.json() as { ok?: boolean };
      if (!response.ok || !payload.ok) throw new Error("Windows helper failed its readiness check");
    } catch {
      // A failed probe means the helper is not usable. Reset so the next call
      // can relaunch, and surface a concise, non sensitive error.
      await this.stop();
      throw new Error("Windows helper is not ready");
    }
    this.healthChecked = true;
  }

  async execute(rawAction: unknown): Promise<string> {
    const action = windowsActionSchema.parse(rawAction);
    await this.start();
    await this.probeHealth();
    let response: Response;
    try {
      response = await fetch(`${this.endpoint}/action`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.token}` },
        body: JSON.stringify(action),
        signal: AbortSignal.timeout(30_000)
      });
    } catch {
      // A transport failure usually means the helper died mid request. Reset so
      // a later call relaunches, and return a concise error with no internals.
      await this.stop();
      throw new Error("Windows helper action failed");
    }
    const payload = await response.json() as { ok?: boolean; output?: string; error?: string };
    if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Windows helper action failed");
    return payload.output ?? "Action completed.";
  }

  async stop(): Promise<void> {
    this.process?.kill();
    this.reset();
  }
}
