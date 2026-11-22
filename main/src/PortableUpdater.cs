using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Windows.Forms;

internal static class PortableUpdater {
    private static int Main(string[] args) {
        if (args.Length != 4) return 1;
        string target = args[0];
        string stage = args[1];
        string next = Path.Combine(stage, "next.exe");
        string backup = Path.Combine(stage, "previous.exe");
        try {
            using (var app = Process.GetProcessById(int.Parse(args[2]))) {
                Console.WriteLine("ready");
                Console.Out.Flush();
                if (!app.WaitForExit(60000)) throw new IOException("The app is still running.");
            }

            // The NSIS portable launcher unlocks its executable just after Electron exits.
            var wait = Stopwatch.StartNew();
            while (true) {
                try { File.Replace(next, target, backup, true); break; }
                catch (IOException) {
                    if (wait.ElapsedMilliseconds >= 45000) throw;
                    Thread.Sleep(250);
                }
            }
            try {
                var launch = new ProcessStartInfo(target) {
                    UseShellExecute = false, WorkingDirectory = Path.GetDirectoryName(target)
                };
                if (args[3].Length > 0) launch.Arguments = "--user-data-dir=\"" + args[3].TrimEnd('\\') + "\"";
                Process.Start(launch).Dispose();
            } catch {
                File.Replace(backup, target, next, true);
                throw;
            }
            File.Delete(backup);
            return 0;
        } catch (Exception error) {
            MessageBox.Show("Could not update " + target + Environment.NewLine + error.Message,
                "PoE Price Checker", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        } finally {
            // A backup left after a failed rollback can be recovered by the user.
            try {
                File.Delete(next);
                if (!File.Exists(backup)) Directory.Delete(stage);
            } catch (IOException) {}
              catch (UnauthorizedAccessException) {}
        }
    }
}
