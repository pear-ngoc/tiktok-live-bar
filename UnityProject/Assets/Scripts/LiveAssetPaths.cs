using System.Collections.Generic;
using System.IO;
using UnityEngine;

namespace TikTokLiveGame
{
    // Resolves user-facing asset folders (DJ_MUSIC, DJ_VIDEO, LiveAssets) across
    // Editor, Windows and macOS layouts. On macOS Application.dataPath points at
    // <App>.app/Contents, so the folder containing the bundle is two levels up.
    public static class LiveAssetPaths
    {
        public static IReadOnlyList<string> CandidateRoots()
        {
            List<string> roots = new();

            void Add(string candidate)
            {
                if (string.IsNullOrEmpty(candidate)) return;
                try
                {
                    string full = Path.GetFullPath(candidate);
                    if (!roots.Contains(full)) roots.Add(full);
                }
                catch (System.Exception)
                {
                    // Ignore roots that cannot be resolved on this platform.
                }
            }

            // User-editable override location, survives re-installs.
            Add(Application.persistentDataPath);

            DirectoryInfo current = new(Application.dataPath);
            for (int depth = 0; depth < 4 && current != null; depth++)
            {
                current = current.Parent;
                Add(current?.FullName);
            }

            Add(Directory.GetCurrentDirectory());
            Add(Application.streamingAssetsPath);
            return roots;
        }

        public static string FindFolder(string relativeFolder)
        {
            foreach (string root in CandidateRoots())
            {
                string candidate = Path.Combine(root, relativeFolder);
                if (Directory.Exists(candidate)) return candidate;
            }
            return null;
        }

        public static string FindFile(string relativeFile)
        {
            foreach (string root in CandidateRoots())
            {
                string candidate = Path.Combine(root, relativeFile);
                if (File.Exists(candidate)) return candidate;
            }
            return null;
        }
    }
}
