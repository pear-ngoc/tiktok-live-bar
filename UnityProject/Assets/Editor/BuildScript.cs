#if UNITY_EDITOR
using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace TikTokLiveGame.Editor
{
    // Deterministic desktop builds for Windows x64 and macOS (Universal).
    // CLI usage:
    //   Unity -quit -batchmode -projectPath UnityProject \
    //     -executeMethod TikTokLiveGame.Editor.BuildScript.BuildWindows64
    //   Unity -quit -batchmode -projectPath UnityProject \
    //     -executeMethod TikTokLiveGame.Editor.BuildScript.BuildMacOS
    public static class BuildScript
    {
        public const string ProductName = "TicToc_Live";
        public const string CompanyName = "TicToc Live";
        public const string WindowsOutputPath = "Build/Windows/TicToc_Live.exe";
        public const string MacOSOutputPath = "Build/macOS/TicToc_Live.app";

        // Standalone architecture values used by Unity 6 (see ProjectSettings
        // platformArchitecture: 1 builds Windows x64 in this repository).
        private const int ArchitectureX64 = 1;
        private const int ArchitectureUniversal = 3;

        [MenuItem("TicToc Live/Build Windows x64")]
        public static void BuildWindows64Menu() => BuildWindows64();

        [MenuItem("TicToc Live/Build macOS (Universal)")]
        public static void BuildMacOSMenu() => BuildMacOS();

        public static void BuildWindows64() => Run(BuildTarget.StandaloneWindows64);

        public static void BuildMacOS() => Run(BuildTarget.StandaloneOSX);

        private static void Run(BuildTarget target)
        {
            bool isMac = target == BuildTarget.StandaloneOSX;
            string outputPath = Path.GetFullPath(isMac ? MacOSOutputPath : WindowsOutputPath);

            if (!EditorUserBuildSettings.SwitchActiveBuildTarget(BuildTargetGroup.Standalone, target))
                throw new InvalidOperationException(
                    $"Cannot switch to {target}. The matching Unity build support module is not installed.");

            if (!isMac)
                CreateTikTokScene.ForceWindowsX64BuildProfile();

            NamedBuildTarget namedTarget = NamedBuildTarget.Standalone;
            ScriptingImplementation previousBackend = PlayerSettings.GetScriptingBackend(namedTarget);
            ManagedStrippingLevel previousStripping = PlayerSettings.GetManagedStrippingLevel(namedTarget);
            bool previousStripEngineCode = PlayerSettings.stripEngineCode;
            string previousCompany = PlayerSettings.companyName;
            string previousProduct = PlayerSettings.productName;
            int previousArchitecture = PlayerSettings.GetArchitecture(namedTarget);

            try
            {
                PlayerSettings.companyName = CompanyName;
                PlayerSettings.productName = ProductName;
                // CI desktop builds use Mono so they match GameCI's
                // windows-mono and mac-mono build support images.
                PlayerSettings.SetScriptingBackend(namedTarget, ScriptingImplementation.Mono2x);
                PlayerSettings.SetManagedStrippingLevel(namedTarget, ManagedStrippingLevel.Low);
                PlayerSettings.stripEngineCode = false;
                PlayerSettings.SetArchitecture(namedTarget, isMac ? ArchitectureUniversal : ArchitectureX64);

                // Remove stale output so the artifact only contains fresh files.
                string outputRoot = Path.GetDirectoryName(outputPath);
                if (isMac)
                {
                    if (Directory.Exists(outputPath)) Directory.Delete(outputPath, true);
                }
                else if (Directory.Exists(outputRoot))
                {
                    Directory.Delete(outputRoot, true);
                }
                Directory.CreateDirectory(outputRoot);

                string[] scenes = Array.ConvertAll(
                    Array.FindAll(EditorBuildSettings.scenes, scene => scene.enabled),
                    scene => scene.path);
                if (scenes.Length == 0)
                    throw new InvalidOperationException("No enabled scenes in EditorBuildSettings.");

                Debug.Log(
                    $"BUILD_CONFIG target={target} " +
                    $"backend={PlayerSettings.GetScriptingBackend(namedTarget)} " +
                    $"architecture={(isMac ? "Universal" : "x64")} " +
                    $"architectureReadback={PlayerSettings.GetArchitecture(namedTarget)} " +
                    $"output={outputPath}");

                BuildReport report = BuildPipeline.BuildPlayer(scenes, outputPath, target, BuildOptions.CompressWithLz4HC);
                if (report.summary.result != BuildResult.Succeeded)
                    throw new InvalidOperationException($"{target} build failed: {report.summary.result}");

                Debug.Log($"BUILD_OK target={target} output={outputPath} sizeBytes={report.summary.totalSize}");
            }
            finally
            {
                PlayerSettings.SetScriptingBackend(namedTarget, previousBackend);
                PlayerSettings.SetManagedStrippingLevel(namedTarget, previousStripping);
                PlayerSettings.stripEngineCode = previousStripEngineCode;
                PlayerSettings.companyName = previousCompany;
                PlayerSettings.productName = previousProduct;
                PlayerSettings.SetArchitecture(namedTarget, previousArchitecture);
                AssetDatabase.SaveAssets();
            }
        }
    }
}
#endif
