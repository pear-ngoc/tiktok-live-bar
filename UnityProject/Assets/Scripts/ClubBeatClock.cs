using System.Globalization;
using System.IO;
using UnityEngine;

namespace TikTokLiveGame
{
    public static class ClubBeatClock
    {
        private static float bpm;
        private static bool loaded;

        public static float Bpm
        {
            get
            {
                Load();
                return bpm;
            }
        }

        public static float Beat => Time.time * Bpm / 60f;

        private static void Load()
        {
            if (loaded) return;
            loaded = true;
            bpm = 128f;
            string videoFolder = LiveAssetPaths.FindFolder("DJ_VIDEO");
            if (!string.IsNullOrEmpty(videoFolder))
            {
                string path = Path.Combine(videoFolder, "BPM.txt");
                if (File.Exists(path) &&
                    float.TryParse(File.ReadAllText(path).Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out float configured))
                    bpm = Mathf.Clamp(configured, 60f, 200f);
            }
            Debug.Log($"Club lighting BPM: {bpm:0.##}");
        }
    }
}
