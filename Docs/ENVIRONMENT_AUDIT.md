# WILDRUNE: THE FORGOTTEN LANDS — Environment Audit

**Audit date:** 2026-11-14 (Asia/Shanghai)
**Audited by:** automated inspection of the live development sandbox
**Method:** direct shell inspection. Every figure below is copied from real command output. Nothing is assumed or estimated unless explicitly labelled *estimate*.
**Verdict:** 🔴 **BLOCKER — this environment cannot build, run, or package Unreal Engine. Milestone 0 cannot pass here.**

---

## 1. Detected environment (measured)

| Item | Detected value | Source command |
|---|---|---|
| Operating system | **Debian GNU/Linux 12 (bookworm)**, x86_64 | `cat /etc/os-release`, `uname -a` |
| Kernel | `5.10.134-013.15.kangaroo.al8.x86_64` | `uname -a` |
| Environment type | Headless container (cgroup-limited), root uid=0 | `id`, `/sys/fs/cgroup` |
| CPU cores | **2** | `nproc` |
| Total RAM | **1,091,140 kB ≈ 1.04 GiB** | `/proc/meminfo` |
| Hard memory cap | **1,073,741,824 bytes = 1.00 GiB** (cgroup `memory.max`) | `cat /sys/fs/cgroup/memory.max` |
| Free RAM at audit | ~797 MB available | `/proc/meminfo` |
| Disk total / free | **9.9 GB total, 9.3 GB free** (single rootfs volume) | `df -h` |
| GPU | **None.** No `nvidia-smi`, no `lspci`, no `/dev/dri` device nodes | direct check |
| Display server | **None.** `DISPLAY` unset, `WAYLAND_DISPLAY` unset | `env` |
| Windows / Wine | **Not present** | `command -v wine` |

### Toolchain

| Tool | Status |
|---|---|
| Visual Studio / MSVC (`cl`, `msbuild`) | ❌ Not installed (Windows-only; cannot exist on this OS) |
| Windows SDK | ❌ Not installed |
| `gcc` / `g++` | ❌ Not installed |
| `clang` / `clang++` | ❌ Not installed |
| `make` / `cmake` / `ninja` | ❌ Not installed |
| .NET SDK (`dotnet`) — required by UnrealBuildTool | ❌ Not installed |
| Unreal Engine (any version) | ❌ **Not installed.** Filesystem search for `UnrealEngine*`, `UE_5*`, `UnrealEditor*` returned zero results |
| Epic Games Launcher | ❌ Not installed (no Windows/macOS host) |
| Blender / Maya / ZBrush / Substance / Houdini / SpeedTree | ❌ None installed |

### Available and working

| Tool | Version |
|---|---|
| Git | 2.39.5 |
| Python | 3.11.2 (no `pip` module) |
| Node.js | v20.20.2 |
| npm | 10.8.2 |
| `apt-get` | present, running as root |
| Outbound network | ✅ Working — TCP 443 reachable to github.com, pypi.org, registry.npmjs.org, download.epicgames.com; HTTPS GET to pypi.org returned **200** |

**Note:** `curl` and `wget` are absent; network checks were performed with Python sockets/urllib.

---

## 2. Gap analysis vs. Unreal Engine 5 requirements

Epic's published specifications (UE 5.8 documentation, *Hardware and Software Specifications for Unreal Engine*):

- Recommended: Windows 11, quad-core ≥2.5 GHz, **32 GB RAM**, **8 GB VRAM**, DirectX 12 GPU.
- Minimum to run the editor: Windows 10 22H2 64-bit + DirectX runtime.
- C++ development: Visual Studio (Epic currently recommends VS 2026 for general development; VS 2022 remains in wide use and is required for some platform toolchains).
- Epic states **12–16 cores** is a practical local-compile baseline without distributed build.

| Requirement | Needed | Available here | Gap |
|---|---|---|---|
| OS for Win64 target | Windows 10/11 x64 | Debian 12 Linux | ❌ Wrong OS. Win64 Shipping builds require the Windows toolchain (MSVC + Windows SDK), or a full Linux→Windows cross-compile setup that itself needs the whole engine source |
| RAM | 32 GB recommended (8 GB practical floor for editor) | **1 GiB hard cap** | ❌ **~32× short.** The UE5 editor alone exceeds this before opening a map |
| CPU | 12–16 cores practical for compilation | 2 | ❌ ~6–8× short |
| Disk | ~40–60 GB installed binary editor + project; **150–400 GB** for a source build with intermediates/PDBs | **9.3 GB** | ❌ **~5–40× short** |
| GPU | DX12, 8 GB VRAM | None | ❌ Editor cannot render; PIE and packaging verification impossible |
| Display | Required for editor/PIE | None | ❌ No interactive verification possible |
| C++ compiler | MSVC / clang | None | ❌ Nothing can compile |
| .NET | Required by UnrealBuildTool | None | ❌ Build system cannot start |
| Engine licence/auth | Epic account + Launcher, or Epic-linked GitHub for source | No credentials provided | ❌ Not authorized/available |

### Conclusion

This is **not a marginal shortfall that can be worked around**. Installing a compiler via `apt-get` would not help: the memory cap (1 GiB), disk (9.3 GB), absent GPU, absent display, and Linux-only OS each independently prevent an Unreal build. A Win64 Shipping package **cannot** be produced or launched from this sandbox under any configuration.

Per the project's non-negotiable rules — *"Never invent test results, performance numbers, installed software, or successful builds"* — I will not report Milestone 0 as passed, and I will not fabricate a packaged executable.

---

## 3. Recommended Unreal Engine version (for the real target machine)

Version landscape verified 2026-11-14:

| Version | Status | Suitability |
|---|---|---|
| **UE 5.8** | **Latest stable** (released June 2026) | ✅ **Recommended primary.** ~5 months of field use and hotfixes; mature Nanite/Lumen/VSM; long support window |
| UE 5.7 | Stable, older (Nov 2025) | ✅ Conservative fallback if the studio's Visual Studio / plugin set is pinned to an older toolchain |
| UE 5.9 | **Preview** (as of Nov 2026) | ❌ Rejected — Epic treats Preview as unstable; violates "prefer a proven compatible version" |

**Recommendation: UE 5.8.x, latest hotfix**, installed via Epic Games Launcher, **pending confirmation of your Visual Studio version and GPU**. If your machine is on VS 2022 with an older SDK, or a plugin you need is not yet 5.8-ready, fall back to **5.7.x**. Final selection must be recorded once the real toolchain is known — I will not lock the version against an unverified machine.

---

## 4. Required steps to reach a buildable environment

These must be performed on a **Windows 10 22H2 / Windows 11 x64 machine**, not in this sandbox. None of these have been performed.

1. **Hardware floor:** ≥16 GB RAM (32 GB recommended), ≥6 cores (12+ preferred), **≥250 GB free SSD**, DX12 GPU with ≥6 GB VRAM (RTX 2000-series / RX 6000-series or newer for Lumen/Nanite).
2. **Visual Studio** with the *Game development with C++* workload, plus:
   - MSVC v143 build tools, **Windows 10/11 SDK (10.0.22621.0 or newer)**,
   - *.NET desktop development* + .NET SDK (UnrealBuildTool),
   - Unreal Engine installer component.
3. **Epic Games Launcher** → install **UE 5.8.x** (accept the EULA; ensure the account is entitled).
4. **Git + Git LFS** (binary `.uasset`/`.umap` content must go through LFS).
5. Optional DCC for custom assets: **Blender 4.x** (free, sufficient for the stylized character/boss/shrine work).
6. Verify: create a blank C++ project → compile → open editor → PIE → package Win64 Shipping → **launch the packaged .exe**. Only then is Milestone 0 truly green.

### Estimated storage budget *(estimate, not measured)*

| Component | Estimate |
|---|---|
| UE 5.8 binary editor | 40–60 GB |
| Visual Studio + SDK + .NET | 20–30 GB |
| Wildrune project (source + content) | 8–20 GB |
| Derived Data Cache | 10–30 GB |
| Intermediate/build + packaged output | 15–30 GB |
| **Total working headroom** | **~150–250 GB SSD** |

---

## 5. What this sandbox CAN legitimately produce

- Complete, real **UE5 C++ project source**: `.uproject`, `Source/Wildrune/**` (all gameplay systems), `Config/*.ini`, automation tests, build scripts.
- Full **documentation set** (design, architecture, roadmap, token budget, asset register, build/packaging instructions).
- **Data-driven content definitions** (items, recipes, enemy stats, objectives) as importable CSV/JSON.
- **Static verification**: C++ syntax/consistency review, reflection-macro correctness, header/module audits, Python-based data validation and unit tests of pure logic.
- A **playable, genuinely verifiable prototype** of the same design using web tech that runs here (Node/browser, live-previewable) — *only with your approval, since it changes the engine requirement.*

**What it cannot produce:** compiled UE binaries, `.uasset`/`.umap` content authored in-editor, Blueprint graphs, animation assets, measured FPS/frame-time numbers, or a launched Win64 Shipping build.

---

## 6. Initial risk register

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | No Unreal toolchain in sandbox → no compile/PIE/package verification | 🔴 Critical | Author source here; compile & verify on your Windows machine. Never label unverified code as verified |
| R2 | Binary content (`.uasset`, Blueprints, animations, meshes) cannot be authored headlessly | 🔴 Critical | Deliver C++ + data + precise editor-side build instructions; or generate custom meshes via a scripted pipeline on your machine |
| R3 | Marketplace/Fab assets require purchase + licence acceptance under your Epic account | 🟠 High | Asset register with candidates + licences; you acquire; nothing unlicensed is used |
| R4 | Performance targets unmeasurable here (no GPU) | 🟠 High | Ship scalable presets + a profiling protocol; report numbers only after you run it on the documented target PC |
| R5 | Engine version chosen without knowing your VS/GPU | 🟠 High | Confirm specs before locking 5.8 vs 5.7 |
| R6 | 1 GiB RAM / 2 cores limits even non-UE work (large builds, headless browsers) | 🟡 Medium | Keep the prototype lightweight; avoid heavy dependencies |
| R7 | 3–5 h playtime is content-heavy for a solo pipeline | 🟡 Medium | Fixed indie scope; vertical slice gate before world production |

---

## 7. Project location

Proposed and created: **`/home/user/Wildrune/`** (dedicated, new, empty — no prior project touched, no destructive operation performed).

Only this audit document exists so far. No engine project, no placeholder classes, and no fabricated build artifacts have been created, in accordance with the rule against empty scaffolding.

---

## 8. Status

| Milestone 0 acceptance criterion | Status |
|---|---|
| Environment audited | ✅ **Done — this document** |
| Unreal version selected | ⚠️ Provisional (5.8.x) — awaiting your hardware/toolchain confirmation |
| New Unreal project created | ⛔ Blocked in sandbox |
| C++ module compiles | ⛔ Blocked — no compiler, no engine |
| Basic map loads | ⛔ Blocked — no editor, no GPU |
| Git repository | ⏳ Available (Git 2.39.5) — will initialize once direction is confirmed |

**Awaiting one decision from you before proceeding** (see conversation). No risky assumption has been made.
