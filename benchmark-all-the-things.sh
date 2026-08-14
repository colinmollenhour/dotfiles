#!/usr/bin/env bash
# benchmark-all-the-things.sh — hardware inventory + CPU/RAM/disk/net
# benchmarks for comparing dedicated servers and VPS vendors.
#
# Only hard dependency: Ubuntu (apt). Parsing is all bash/awk/sed.
# Packages are installed with apt; Ookla Speedtest is fetched into a
# temp dir. Nothing is auto-removed — cleanup commands are printed
# at the end.
set -Eeuo pipefail

SCRIPT_NAME="$(basename "$0")"
VERSION="1.0.0"

# --- defaults -------------------------------------------------------------
OUTPUT_DIR=""
DISK_DIR=""
VENDOR=""
LABEL=""
THREADS=""
FIO_SIZE=""
FIO_RUNTIME=""
FIO_IOENGINE="libaio"
QUICK=false
INVENTORY_ONLY=false
NO_INSTALL=false
KEEP_TEMP=false
DRY_RUN=false
QUIET=false
SKIP_CPU=false
SKIP_MEM=false
SKIP_DISK=false
SKIP_NET=false
SKIP_CRYPTO=false
IPERF_HOST=""
COMPARE_DIRS=()

SUDO=""
TMPDIR_BENCH=""
RAW=""
SCORES_FILE=""
HW_FILE=""
SANITY_FILE=""
STARTED_EPOCH=0
FINISHED_EPOCH=0
STARTED_ISO=""
INTERRUPTED=false

NEED_PKGS=()
ALREADY_PKGS=()
INSTALLED_PKGS=()
FAILED_PKGS=()
WARNINGS=()
SANITY_FAILS=0

# --- colors (stderr / progress only) --------------------------------------
if [[ -t 2 && -z "${NO_COLOR:-}" && "${TERM:-}" != "dumb" ]]; then
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'
  C_CYAN=$'\033[36m'; C_GREEN=$'\033[32m'
  C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'
  C_DIM=$'\033[2m'
else
  C_RESET=''; C_BOLD=''; C_CYAN=''; C_GREEN=''
  C_YELLOW=''; C_RED=''; C_DIM=''
fi

log() {
  [[ "$QUIET" == true ]] && return
  printf '%s\n' "$*" >&2
}

section() {
  [[ "$QUIET" == true ]] && return
  printf '\n%s==> %s%s\n' "$C_BOLD$C_CYAN" "$*" "$C_RESET" >&2
}

warn() {
  printf '%sWarning:%s %s\n' "$C_YELLOW" "$C_RESET" "$*" >&2
  WARNINGS+=("$*")
}

note_sanity() {
  local level="$1"; shift
  printf '%s\t%s\n' "$level" "$*" >> "$SANITY_FILE"
  if [[ "$level" == "WARN" ]]; then
    SANITY_FAILS=$((SANITY_FAILS + 1))
    printf '%sSanity:%s %s\n' "$C_YELLOW" "$C_RESET" "$*" >&2
  fi
}

die() {
  printf '%sError:%s %s\n\n' "$C_RED" "$C_RESET" "$*" >&2
  printf 'Run `%s --help` for usage.\n' "$SCRIPT_NAME" >&2
  exit 1
}

show_help() {
  cat << EOF
Inventory a server and run comparable CPU, RAM, disk, and network
benchmarks. Writes a Markdown report plus a scores table you can
diff across vendors.

USAGE
  $SCRIPT_NAME [OPTIONS]
  $SCRIPT_NAME --compare DIR [DIR ...]

EXAMPLES
  sudo $SCRIPT_NAME
  sudo $SCRIPT_NAME --vendor Hetzner --label 'AX41-NVMe' -o ./hetzner-ax41
  sudo $SCRIPT_NAME --quick --skip-net
  sudo $SCRIPT_NAME --inventory-only
  $SCRIPT_NAME --compare ./hetzner-ax41 ./ovh-advance-1

OPTIONS
  -o, --output DIR       Report directory (default: ./bench-HOST-TIMESTAMP)
      --disk-dir DIR     Filesystem fio writes to (default: report dir)
      --vendor NAME      Vendor name stored in the report (Hetzner, OVH, ...)
      --label TEXT       Extra label (SKU, plan, city)
      --threads N        Threads for multi-core tests (default: nproc)
      --fio-size SIZE    fio working set, e.g. 2G or 512M (default: 2G, quick: 512M)
      --fio-runtime SEC  Seconds per fio job (default: 30, quick: 10)
      --iperf HOST[:P]   Also run iperf3 against this host
      --quick            Shorter tests (~2–3 min instead of ~6–8)
      --inventory-only   Hardware + OS only; skip benchmarks
      --skip-cpu         Skip sysbench CPU
      --skip-mem         Skip sysbench memory and mbw
      --skip-disk        Skip fio and hdparm
      --skip-net         Skip speedtest, ping, and iperf
      --skip-crypto      Skip openssl speed
      --no-install       Do not apt-get install; use whatever is present
      --keep-temp        Keep the download temp directory
  -n, --dry-run          Show what would run and exit
  -q, --quiet            Less progress on stderr
      --no-color         Disable color on stderr
      --compare DIR...   Print a comparison table from previous reports
  -h, --help             Show this help
      --version          Show version and exit

REPORT
  report.md     Human-readable report with hardware, scoreboard, details
  scores.tsv    Stable metrics for --compare / spreadsheets
  hw.tsv        Parsed hardware fields
  raw/          Full tool output (unparsed)

Root/sudo is required to install packages and to read DIMM speed
(dmidecode) and SMART data. Benchmarks themselves can run unprivileged
if the tools are already installed and --no-install is set.
EOF
}

show_version() {
  printf '%s %s\n' "$SCRIPT_NAME" "$VERSION"
}

# --- small helpers --------------------------------------------------------
have() { command -v "$1" >/dev/null 2>&1; }

run_root() {
  if [[ -n "$SUDO" ]]; then
    "$SUDO" "$@"
  else
    "$@"
  fi
}

trim() {
  local s="${1-}"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

md_escape() {
  printf '%s' "${1-}" | sed 's/|/\\|/g'
}

is_number() {
  [[ "${1-}" =~ ^[0-9]+([.][0-9]+)?$ ]]
}

size_to_bytes() {
  local s="${1-}"
  case "$s" in
    *[Gg]) awk -v n="${s%[Gg]}" 'BEGIN { printf "%.0f", n * 1024 * 1024 * 1024 }' ;;
    *[Mm]) awk -v n="${s%[Mm]}" 'BEGIN { printf "%.0f", n * 1024 * 1024 }' ;;
    *[Kk]) awk -v n="${s%[Kk]}" 'BEGIN { printf "%.0f", n * 1024 }' ;;
    *)     printf '%s' "$s" ;;
  esac
}

# 12.3k -> 12300; 1.2M -> 1200000
expand_count() {
  local s="${1-}"
  awk -v s="$s" 'BEGIN {
    if (s == "" || s == "n/a") { print "n/a"; exit }
    if (s ~ /[Kk]$/) { sub(/[Kk]$/, "", s); printf "%.0f", s * 1000; exit }
    if (s ~ /[Mm]$/) { sub(/[Mm]$/, "", s); printf "%.0f", s * 1000000; exit }
    if (s ~ /[Gg]$/) { sub(/[Gg]$/, "", s); printf "%.0f", s * 1000000000; exit }
    if (s == int(s)) printf "%.0f", s + 0
    else printf "%.2f", s + 0
  }'
}

# 48.1MiB/s | 3425KiB/s | 1.2GiB/s | 50.4MB/s -> MiB/s
bw_to_mib() {
  local s="${1-}"
  awk -v s="$s" 'BEGIN {
    gsub(/\/s$/, "", s)
    if (s ~ /GiB$/) { sub(/GiB$/, "", s); printf "%.2f", s * 1024; exit }
    if (s ~ /MiB$/) { sub(/MiB$/, "", s); printf "%.2f", s + 0; exit }
    if (s ~ /KiB$/) { sub(/KiB$/, "", s); printf "%.2f", s / 1024; exit }
    if (s ~ /GB$/)  { sub(/GB$/,  "", s); printf "%.2f", s * 1000 / 1.048576; exit }
    if (s ~ /MB$/)  { sub(/MB$/,  "", s); printf "%.2f", s / 1.048576; exit }
    if (s ~ /KB$/)  { sub(/KB$/,  "", s); printf "%.2f", s / 1024; exit }
    print "n/a"
  }'
}

lat_to_us() {
  local value="${1-}" unit="${2-}"
  awk -v v="$value" -v u="$unit" 'BEGIN {
    if (v == "" || v == "n/a") { print "n/a"; exit }
    if (u ~ /nsec/) { printf "%.2f", v / 1000; exit }
    if (u ~ /usec/) { printf "%.2f", v + 0; exit }
    if (u ~ /msec/) { printf "%.2f", v * 1000; exit }
    if (u ~ /sec/)  { printf "%.2f", v * 1000000; exit }
    printf "%.2f", v + 0
  }'
}

fmt2() {
  local n="${1-}"
  if ! is_number "$n"; then
    printf '%s' "${n:-n/a}"
    return
  fi
  awk -v n="$n" 'BEGIN { printf "%.2f", n + 0 }'
}

fmt0() {
  local n="${1-}"
  if ! is_number "$n"; then
    printf '%s' "${n:-n/a}"
    return
  fi
  awk -v n="$n" 'BEGIN { printf "%.0f", n + 0 }'
}

human_duration() {
  local s="${1:-0}"
  awk -v s="$s" 'BEGIN {
    s = int(s)
    if (s < 60) { printf "%ds", s; exit }
    if (s < 3600) { printf "%dm %ds", s/60, s%60; exit }
    printf "%dh %dm %ds", s/3600, (s%3600)/60, s%60
  }'
}

pkg_installed() {
  dpkg-query -W -f='${Status}' "$1" 2>/dev/null | grep -q 'install ok installed'
}

hw() {
  printf '%s\t%s\n' "$1" "${2-}" >> "$HW_FILE"
}

score() {
  # score key value unit better label
  local key="$1" value="${2:-n/a}" unit="${3-}" better="${4:-info}" label="${5-}"
  printf '%s\t%s\t%s\t%s\t%s\n' "$key" "$value" "$unit" "$better" "$label" >> "$SCORES_FILE"
}

score_get() {
  local key="$1"
  [[ -f "$SCORES_FILE" ]] || { printf 'n/a'; return; }
  awk -F '\t' -v k="$key" '$1 == k { print $2; found=1; exit } END { if (!found) print "n/a" }' "$SCORES_FILE"
}

hw_get() {
  local key="$1"
  [[ -f "$HW_FILE" ]] || { printf ''; return; }
  awk -F '\t' -v k="$key" '$1 == k { print $2; found=1; exit } END { if (!found) print "" }' "$HW_FILE"
}

# Extract KEY="value" from lsblk --pairs (-P) output.
lsblk_p() {
  local line="$1" key="$2"
  printf '%s\n' "$line" | awk -v key="$key" '
    {
      pat = key "=\""
      idx = index($0, pat)
      if (idx == 0) { print ""; exit }
      rest = substr($0, idx + length(pat))
      sub(/".*/, "", rest)
      print rest
    }
  '
}

# --- argument parsing -----------------------------------------------------
parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -h|--help) show_help; exit 0 ;;
      --version) show_version; exit 0 ;;
      --no-color) C_RESET=''; C_BOLD=''; C_CYAN=''; C_GREEN=''; C_YELLOW=''; C_RED=''; C_DIM=''; shift ;;
      -q|--quiet) QUIET=true; shift ;;
      -n|--dry-run) DRY_RUN=true; shift ;;
      --quick) QUICK=true; shift ;;
      --inventory-only) INVENTORY_ONLY=true; shift ;;
      --no-install) NO_INSTALL=true; shift ;;
      --keep-temp) KEEP_TEMP=true; shift ;;
      --skip-cpu) SKIP_CPU=true; shift ;;
      --skip-mem) SKIP_MEM=true; shift ;;
      --skip-disk) SKIP_DISK=true; shift ;;
      --skip-net) SKIP_NET=true; shift ;;
      --skip-crypto) SKIP_CRYPTO=true; shift ;;
      -o|--output)
        [[ $# -ge 2 ]] || die "$1 requires a directory"
        OUTPUT_DIR="$2"; shift 2 ;;
      --disk-dir)
        [[ $# -ge 2 ]] || die "$1 requires a directory"
        DISK_DIR="$2"; shift 2 ;;
      --vendor)
        [[ $# -ge 2 ]] || die "$1 requires a name"
        VENDOR="$2"; shift 2 ;;
      --label)
        [[ $# -ge 2 ]] || die "$1 requires text"
        LABEL="$2"; shift 2 ;;
      --threads)
        [[ $# -ge 2 ]] || die "$1 requires a number"
        THREADS="$2"; shift 2 ;;
      --fio-size)
        [[ $# -ge 2 ]] || die "$1 requires a size"
        FIO_SIZE="$2"; shift 2 ;;
      --fio-runtime)
        [[ $# -ge 2 ]] || die "$1 requires seconds"
        FIO_RUNTIME="$2"; shift 2 ;;
      --iperf)
        [[ $# -ge 2 ]] || die "$1 requires HOST[:PORT]"
        IPERF_HOST="$2"; shift 2 ;;
      --compare)
        shift
        [[ $# -gt 0 ]] || die "--compare requires at least one report directory"
        COMPARE_DIRS=("$@")
        return 0
        ;;
      --)
        shift
        [[ $# -eq 0 ]] || die "Unexpected positional argument: $1"
        ;;
      -*)
        die "Unknown option: $1"
        ;;
      *)
        die "Unexpected positional argument: $1 (reports go in --output DIR)"
        ;;
    esac
  done
}

# --- compare mode ---------------------------------------------------------
compare_better() {
  local a="$1" b="$2" better="$3"
  if ! is_number "$a" || ! is_number "$b"; then
    printf ''
    return
  fi
  awk -v a="$a" -v b="$b" -v better="$better" 'BEGIN {
    if (a == b) { print "tie"; exit }
    if (better == "higher") {
      if (a > b) print "a"; else print "b"
    } else if (better == "lower") {
      if (a < b) print "a"; else print "b"
    } else {
      print ""
    }
  }'
}

compare_delta() {
  local a="$1" b="$2" better="$3"
  if ! is_number "$a" || ! is_number "$b"; then
    printf ''
    return
  fi
  awk -v a="$a" -v b="$b" -v better="$better" 'BEGIN {
    hi = (a > b) ? a : b
    lo = (a > b) ? b : a
    if (lo == 0) { printf ""; exit }
    if (better == "higher") {
      printf "+%.1f%%", (hi / lo - 1) * 100
    } else if (better == "lower") {
      printf "%.2fx lower", hi / lo
    }
  }'
}

run_compare() {
  local dir file n i key unit better label
  local -a dirs=() names=() files=()
  local -A seen=()
  local -a keys=()

  for dir in "${COMPARE_DIRS[@]}"; do
    file="$dir/scores.tsv"
    [[ -f "$file" ]] || die "No scores.tsv in $dir"
    dirs+=("$dir")
    files+=("$file")
    if [[ -f "$dir/hw.tsv" ]]; then
      names+=("$(awk -F '\t' '$1=="label.short"{print $2; exit}' "$dir/hw.tsv")")
    else
      names+=("$(basename "$dir")")
    fi
    [[ -n "${names[-1]}" ]] || names[-1]="$(basename "$dir")"
  done

  n=${#files[@]}

  for file in "${files[@]}"; do
    while IFS= read -r key; do
      [[ -z "$key" ]] && continue
      if [[ -z "${seen[$key]+x}" ]]; then
        seen[$key]=1
        keys+=("$key")
      fi
    done < <(awk -F '\t' '$1 != "" && $1 !~ /^#/ && $4 != "info" { print $1 }' "$file")
  done

  printf '%s\n' "Comparing ${n} report(s)."
  printf '\n'

  {
    printf 'Metric'
    for i in "${!names[@]}"; do
      printf '\t%s' "${names[$i]}"
    done
    if (( n == 2 )); then
      printf '\tWinner'
    fi
    printf '\n'

    for key in "${keys[@]}"; do
      unit=""; better=""; label=""
      local -a vals=()
      for file in "${files[@]}"; do
        local line value
        line="$(awk -F '\t' -v k="$key" '$1==k {print; exit}' "$file")"
        value="$(printf '%s' "$line" | awk -F '\t' '{print $2}')"
        [[ -n "$unit" ]] || unit="$(printf '%s' "$line" | awk -F '\t' '{print $3}')"
        [[ -n "$better" ]] || better="$(printf '%s' "$line" | awk -F '\t' '{print $4}')"
        [[ -n "$label" ]] || label="$(printf '%s' "$line" | awk -F '\t' '{print $5}')"
        vals+=("${value:-n/a}")
      done
      printf '%s' "${label:-$key}"
      [[ -n "$unit" ]] && printf ' (%s)' "$unit"
      for i in "${!vals[@]}"; do
        printf '\t%s' "${vals[$i]}"
      done
      if (( n == 2 )); then
        local winner delta
        winner="$(compare_better "${vals[0]}" "${vals[1]}" "$better")"
        case "$winner" in
          a) delta="$(compare_delta "${vals[0]}" "${vals[1]}" "$better")"
             printf '\t%s %s' "${names[0]}" "${delta}" ;;
          b) delta="$(compare_delta "${vals[0]}" "${vals[1]}" "$better")"
             printf '\t%s %s' "${names[1]}" "${delta}" ;;
          tie) printf '\t%s' "tie" ;;
          *) printf '\t' ;;
        esac
      fi
      printf '\n'
    done
  } | {
    if have column; then
      column -t -s $'\t'
    else
      cat
    fi
  }

  printf '\n'
  printf 'Higher is better except latency, ping, steal, and similar "lower" metrics.\n'
}

# --- environment / packages ----------------------------------------------
require_ubuntu() {
  local id="" like="" pretty=""
  if [[ -f /etc/os-release ]]; then
    # shellcheck disable=SC1091
    id="$(. /etc/os-release; printf '%s' "${ID-}")"
    like="$(. /etc/os-release; printf '%s' "${ID_LIKE-}")"
    pretty="$(. /etc/os-release; printf '%s' "${PRETTY_NAME-}")"
  fi
  if [[ "$id" != "ubuntu" ]]; then
    if [[ "$like" == *ubuntu* || "$like" == *debian* ]]; then
      warn "This is ${pretty:-$id}, not Ubuntu. apt package names may differ."
    else
      die "This script expects Ubuntu (apt). Detected: ${pretty:-unknown}"
    fi
  fi
}

setup_privileges() {
  if [[ "${EUID}" -eq 0 ]]; then
    SUDO=""
    return
  fi

  if have sudo && sudo -n true 2>/dev/null; then
    SUDO="sudo"
    return
  fi

  if [[ "$NO_INSTALL" == true ]]; then
    warn "Not root; DIMM speed and SMART data may be missing. Installs are disabled."
    SUDO=""
    return
  fi

  if ! have sudo; then
    die "Need root or sudo to install packages. Rerun with sudo, or pass --no-install."
  fi

  if [[ -t 0 ]]; then
    log "Need sudo for package install and some hardware probes."
    sudo -v || die "sudo is required"
    SUDO="sudo"
  else
    die "Need root or passwordless sudo in non-interactive mode (or pass --no-install)."
  fi
}

plan_packages() {
  local pkg
  local wanted=()

  wanted+=(dmidecode smartmontools pciutils ethtool nvme-cli)
  if [[ "$INVENTORY_ONLY" != true ]]; then
    [[ "$SKIP_CPU" == true && "$SKIP_MEM" == true ]] || wanted+=(sysbench)
    [[ "$SKIP_DISK" == true ]] || wanted+=(fio hdparm)
    [[ "$SKIP_MEM" == true ]] || wanted+=(mbw)
    [[ "$SKIP_NET" == true && -z "$IPERF_HOST" ]] || wanted+=(curl ca-certificates)
    [[ -z "$IPERF_HOST" ]] || wanted+=(iperf3)
  fi

  NEED_PKGS=()
  ALREADY_PKGS=()
  for pkg in "${wanted[@]}"; do
    if pkg_installed "$pkg"; then
      ALREADY_PKGS+=("$pkg")
    else
      NEED_PKGS+=("$pkg")
    fi
  done
}

install_packages() {
  local pkg
  plan_packages

  if [[ "$NO_INSTALL" == true ]]; then
    log "Skipping package install (--no-install)."
    return
  fi
  if ((${#NEED_PKGS[@]} == 0)); then
    log "All required apt packages are already installed."
    return
  fi

  section "Installing packages"
  log "Will install: ${NEED_PKGS[*]}"
  if [[ "$DRY_RUN" == true ]]; then
    return
  fi

  export DEBIAN_FRONTEND=noninteractive
  if ! run_root apt-get update -qq; then
    warn "apt-get update failed; trying install anyway"
  fi
  for pkg in "${NEED_PKGS[@]}"; do
    if run_root apt-get install -y -qq --no-install-recommends "$pkg"; then
      INSTALLED_PKGS+=("$pkg")
      log "Installed $pkg"
    else
      FAILED_PKGS+=("$pkg")
      warn "Could not install $pkg (enable Universe if this is a universe package)."
    fi
  done
}

download_speedtest() {
  local arch tarball url dest
  have curl || return 1
  arch="$(uname -m)"
  case "$arch" in
    x86_64|amd64) tarball="ookla-speedtest-1.2.0-linux-x86_64.tgz" ;;
    aarch64|arm64) tarball="ookla-speedtest-1.2.0-linux-aarch64.tgz" ;;
    armv7l|armhf) tarball="ookla-speedtest-1.2.0-linux-armhf.tgz" ;;
    i386|i686) tarball="ookla-speedtest-1.2.0-linux-i386.tgz" ;;
    *) warn "No Ookla Speedtest build for $arch"; return 1 ;;
  esac
  url="https://install.speedtest.net/app/cli/${tarball}"
  dest="$TMPDIR_BENCH/$tarball"
  log "Downloading Ookla Speedtest CLI ($arch)"
  if ! curl -fsSL --retry 3 --retry-delay 2 --max-time 60 "$url" -o "$dest"; then
    warn "Failed to download $url"
    return 1
  fi
  tar -xzf "$dest" -C "$TMPDIR_BENCH"
  [[ -x "$TMPDIR_BENCH/speedtest" ]] || return 1
  return 0
}

# --- run + parse ----------------------------------------------------------
run_logged() {
  local name="$1"; shift
  local logf="$RAW/${name}.txt" rc=0
  {
    printf 'COMMAND: %s\n' "$*"
    printf 'STARTED: %s\n' "$(date -Is)"
    "$@" || rc=$?
    printf 'EXIT: %s\n' "$rc"
    printf 'FINISHED: %s\n' "$(date -Is)"
  } > "$logf" 2>&1
  return "$rc"
}

# Match an lscpu-style "Key: value" line by literal field name (the text
# before the first colon). A name like "L1d" also matches "L1d cache".
# Do not pass regex here: mawk warns on \( when the pattern is set via -v.
awk_first() {
  local file="$1" label="$2"
  [[ -f "$file" ]] || { printf ''; return; }
  awk -F: -v label="$label" '
    {
      key = $1
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", key)
      if (key == label || substr(key, 1, length(label) + 1) == label " ") {
        val = $0
        sub(/^[^:]+:[[:space:]]*/, "", val)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", val)
        print val
        exit
      }
    }
  ' "$file"
}

parse_sysbench_cpu() {
  local file="$1" prefix="$2" label="$3"
  local eps avg p95
  eps="$(awk -F: '/events per second/ { gsub(/[[:space:]]/, "", $2); print $2; exit }' "$file")"
  avg="$(awk -F: '/^[[:space:]]+avg:/ { gsub(/[[:space:]]/, "", $2); print $2; exit }' "$file")"
  p95="$(awk -F: '/95th percentile/ { gsub(/[[:space:]]/, "", $2); print $2; exit }' "$file")"
  [[ -n "$eps" ]] || eps="n/a"
  score "${prefix}.eps" "$eps" "events/s" higher "$label events/s"
  score "${prefix}.lat_avg_ms" "${avg:-n/a}" "ms" lower "$label avg latency"
  score "${prefix}.lat_p95_ms" "${p95:-n/a}" "ms" lower "$label p95 latency"
}

parse_sysbench_mem() {
  local file="$1" prefix="$2" label="$3"
  local mib
  mib="$(awk '
    /MiB transferred/ && match($0, /\([0-9.]+ MiB\/sec\)/) {
      s = substr($0, RSTART + 1, RLENGTH - 2)
      sub(/ MiB\/sec$/, "", s)
      print s
      exit
    }
    /MB transferred/ && match($0, /\([0-9.]+ MB\/sec\)/) {
      s = substr($0, RSTART + 1, RLENGTH - 2)
      sub(/ MB\/sec$/, "", s)
      print s
      exit
    }
  ' "$file")"
  [[ -n "$mib" ]] || mib="n/a"
  score "${prefix}" "$mib" "MiB/s" higher "$label"
}

# Extract IOPS, BW, avg lat from a fio "read:" / "write:" block.
parse_fio_section() {
  local file="$1" kind="$2"
  # kind is read or write. POSIX awk only (Ubuntu ships mawk).
  awk -v kind="$kind" '
    $0 ~ "^[[:space:]]*" kind ":" {
      line = $0
      iops = "n/a"; bw = "n/a"
      if (match(line, /IOPS=[^, ]+/)) iops = substr(line, RSTART + 5, RLENGTH - 5)
      if (match(line, /BW=[^ ,]+/)) bw = substr(line, RSTART + 3, RLENGTH - 3)
      print "IOPS=" iops
      print "BW=" bw
      grab = 1
      next
    }
    grab && $0 ~ /^[[:space:]]+lat \(/ {
      unit = "usec"
      if (match($0, /\([^)]+\)/)) unit = substr($0, RSTART + 1, RLENGTH - 2)
      avg = "n/a"
      if (match($0, /avg=[0-9.]+/)) avg = substr($0, RSTART + 4, RLENGTH - 4)
      print "LAT_UNIT=" unit
      print "LAT_AVG=" avg
      grab = 0
    }
    grab && $0 ~ /^[[:space:]]+(read|write|trim):/ { grab = 0 }
  ' "$file"
}

fio_iops_from() {
  local parsed="$1"
  local raw
  raw="$(printf '%s\n' "$parsed" | awk -F= '/^IOPS=/ {print $2; exit}')"
  expand_count "$raw"
}

fio_mib_from() {
  local parsed="$1"
  local raw
  raw="$(printf '%s\n' "$parsed" | awk -F= '/^BW=/ {print $2; exit}')"
  bw_to_mib "$raw"
}

fio_lat_from() {
  local parsed="$1"
  local unit avg
  unit="$(printf '%s\n' "$parsed" | awk -F= '/^LAT_UNIT=/ {print $2; exit}')"
  avg="$(printf '%s\n' "$parsed" | awk -F= '/^LAT_AVG=/ {print $2; exit}')"
  lat_to_us "$avg" "$unit"
}

record_fio() {
  local file="$1" prefix="$2" label="$3" which="$4"
  local parsed iops mib lat
  parsed="$(parse_fio_section "$file" "$which")"
  iops="$(fio_iops_from "$parsed")"
  mib="$(fio_mib_from "$parsed")"
  lat="$(fio_lat_from "$parsed")"
  score "${prefix}_iops" "$iops" "IOPS" higher "${label} IOPS"
  score "${prefix}_mib_s" "$mib" "MiB/s" higher "${label} bandwidth"
  score "${prefix}_lat_avg_us" "$lat" "µs" lower "${label} avg latency"
}

# --- hardware inventory ---------------------------------------------------
collect_cpu() {
  local model="" cores="" threads="" sockets="" mhz="" maxmhz="" virt="" flags="" governor=""
  local aes="no" avx="no" avx2="no" avx512="no" l1d="" l1i="" l2="" l3=""

  section "Hardware: CPU"
  if have lscpu; then
    lscpu > "$RAW/lscpu.txt" 2>&1 || true
  fi
  cat /proc/cpuinfo > "$RAW/cpuinfo.txt" 2>&1 || true
  if have dmidecode; then
    run_root dmidecode -t processor > "$RAW/dmidecode-processor.txt" 2>&1 || true
  fi

  model="$(awk_first "$RAW/lscpu.txt" 'Model name')"
  [[ -n "$model" ]] || model="$(awk -F: '/model name/ { gsub(/^[[:space:]]+/, "", $2); print $2; exit }' /proc/cpuinfo)"
  cores="$(awk_first "$RAW/lscpu.txt" 'Core(s) per socket')"
  sockets="$(awk_first "$RAW/lscpu.txt" 'Socket(s)')"
  threads="$(awk_first "$RAW/lscpu.txt" 'CPU(s)')"
  [[ -n "$threads" ]] || threads="$(nproc 2>/dev/null || echo 1)"
  mhz="$(awk_first "$RAW/lscpu.txt" 'CPU MHz')"
  maxmhz="$(awk_first "$RAW/lscpu.txt" 'CPU max MHz')"
  virt="$(awk_first "$RAW/lscpu.txt" 'Virtualization')"
  flags="$(awk_first "$RAW/lscpu.txt" 'Flags')"
  [[ -n "$flags" ]] || flags="$(awk '/^flags/ {print; exit }' /proc/cpuinfo)"
  l1d="$(awk_first "$RAW/lscpu.txt" 'L1d')"
  l1i="$(awk_first "$RAW/lscpu.txt" 'L1i')"
  l2="$(awk_first "$RAW/lscpu.txt" 'L2')"
  l3="$(awk_first "$RAW/lscpu.txt" 'L3')"

  if [[ -r /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor ]]; then
    governor="$(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null || true)"
  fi

  printf '%s' "$flags" | grep -qw aes && aes="yes" || aes="no"
  printf '%s' "$flags" | grep -qw avx && avx="yes" || avx="no"
  printf '%s' "$flags" | grep -qw avx2 && avx2="yes" || avx2="no"
  printf '%s' "$flags" | grep -E -qw 'avx512f|avx512_vpopcntdq' && avx512="yes" || avx512="no"

  hw "cpu.model" "$model"
  hw "cpu.sockets" "$sockets"
  hw "cpu.cores_per_socket" "$cores"
  hw "cpu.threads" "$threads"
  hw "cpu.mhz" "$mhz"
  hw "cpu.max_mhz" "$maxmhz"
  hw "cpu.virt_ext" "$virt"
  hw "cpu.governor" "$governor"
  hw "cpu.aes_ni" "$aes"
  hw "cpu.avx" "$avx"
  hw "cpu.avx2" "$avx2"
  hw "cpu.avx512" "$avx512"
  hw "cpu.l1d" "$l1d"
  hw "cpu.l1i" "$l1i"
  hw "cpu.l2" "$l2"
  hw "cpu.l3" "$l3"
  log "CPU: ${model:-unknown}  threads=${threads}  max=${maxmhz:-$mhz} MHz"
}

collect_memory() {
  local total_mib="" type_guess="" speed_guess="" modules=""
  section "Hardware: memory"

  awk '/MemTotal:/ {printf "%.0f\n", $2/1024}' /proc/meminfo > "$RAW/memtotal-mib.txt"
  total_mib="$(cat "$RAW/memtotal-mib.txt")"
  cat /proc/meminfo > "$RAW/meminfo.txt" 2>&1 || true
  if have dmidecode; then
    run_root dmidecode -t 16 > "$RAW/dmidecode-memarray.txt" 2>&1 || true
    run_root dmidecode -t 17 > "$RAW/dmidecode-memory.txt" 2>&1 || true
  else
    printf 'dmidecode not installed\n' > "$RAW/dmidecode-memory.txt"
  fi

  hw "ram.total_mib" "$total_mib"

  if ! have dmidecode; then
    hw "ram.type" ""
    hw "ram.speed" ""
    hw "ram.modules" ""
    warn "dmidecode is not installed; DIMM type and clock are unknown."
    log "RAM: ${total_mib} MiB"
  elif grep -qE 'Operation not permitted|No SMBIOS|Permission denied|command not found' "$RAW/dmidecode-memory.txt"; then
    hw "ram.type" ""
    hw "ram.speed" ""
    hw "ram.modules" ""
    warn "Could not read DIMM type/speed (need root + SMBIOS). VPS guests often hide this."
    log "RAM: ${total_mib} MiB"
  elif [[ -s "$RAW/dmidecode-memory.txt" ]]; then
    awk '
      BEGIN { RS = ""; FS = "\n" }
      /Memory Device/ {
        size = ""; typ = ""; speed = ""; cspeed = ""; mfr = ""; part = ""; loc = ""
        for (i = 1; i <= NF; i++) {
          line = $i
          sub(/^[[:space:]]+/, "", line)
          if (line ~ /^Size:/) {
            size = line; sub(/^Size:[[:space:]]*/, "", size)
          } else if (line ~ /^Type:/) {
            typ = line; sub(/^Type:[[:space:]]*/, "", typ)
          } else if (line ~ /^Speed:/) {
            speed = line; sub(/^Speed:[[:space:]]*/, "", speed)
          } else if (line ~ /^Configured Memory Speed:/ || line ~ /^Configured Clock Speed:/) {
            cspeed = line; sub(/^Configured[^:]+:[[:space:]]*/, "", cspeed)
          } else if (line ~ /^Manufacturer:/) {
            mfr = line; sub(/^Manufacturer:[[:space:]]*/, "", mfr)
          } else if (line ~ /^Part Number:/) {
            part = line; sub(/^Part Number:[[:space:]]*/, "", part)
          } else if (line ~ /^Locator:/) {
            loc = line; sub(/^Locator:[[:space:]]*/, "", loc)
          }
        }
        if (size == "" || size ~ /No Module/ || size ~ /^0 /) next
        if (typ == "Unknown" || typ == "") typ = "?"
        if (cspeed != "" && cspeed != "Unknown") speed_out = cspeed
        else speed_out = speed
        printf "%s\t%s\t%s\t%s\t%s\t%s\n", loc, size, typ, speed_out, mfr, part
      }
    ' "$RAW/dmidecode-memory.txt" > "$RAW/memory-modules.tsv" || true

    if [[ -s "$RAW/memory-modules.tsv" ]]; then
      type_guess="$(awk -F '\t' '$3 != "?" { print $3; exit }' "$RAW/memory-modules.tsv")"
      speed_guess="$(awk -F '\t' '$4 != "" && $4 != "Unknown" { print $4; exit }' "$RAW/memory-modules.tsv")"
      modules="$(wc -l < "$RAW/memory-modules.tsv" | tr -d ' ')"
      hw "ram.type" "$type_guess"
      hw "ram.speed" "$speed_guess"
      hw "ram.modules" "$modules"
      log "RAM: ${total_mib} MiB  ${type_guess:-unknown}  ${speed_guess:-speed unknown}  ${modules} module(s)"
    else
      hw "ram.type" ""
      hw "ram.speed" ""
      hw "ram.modules" "0"
      warn "dmidecode listed no installed DIMMs (common on some VPS)."
    fi
  else
    hw "ram.type" ""
    hw "ram.speed" ""
    hw "ram.modules" ""
    warn "Could not read DIMM type/speed (need root + SMBIOS). VPS guests often hide this."
    log "RAM: ${total_mib} MiB"
  fi
}

collect_disks() {
  local name model serial size rota tran typ sched path
  section "Hardware: disks"

  lsblk -d -n -b -P -o NAME,MODEL,SERIAL,SIZE,ROTA,TRAN,TYPE > "$RAW/lsblk.txt" 2>&1 || true
  lsblk -o NAME,MODEL,SIZE,ROTA,TRAN,TYPE,FSTYPE,MOUNTPOINT > "$RAW/lsblk-full.txt" 2>&1 || true
  have nvme && nvme list > "$RAW/nvme-list.txt" 2>&1 || true
  have lspci && lspci -nn | grep -Ei 'nvme|sata|raid|storage|scsi' > "$RAW/lspci-storage.txt" 2>&1 || true

  : > "$RAW/disks.tsv"
  mkdir -p "$RAW/smart"

  local line
  while IFS= read -r line; do
    name="$(lsblk_p "$line" NAME)"
    model="$(trim "$(lsblk_p "$line" MODEL)")"
    serial="$(trim "$(lsblk_p "$line" SERIAL)")"
    size="$(lsblk_p "$line" SIZE)"
    rota="$(lsblk_p "$line" ROTA)"
    tran="$(lsblk_p "$line" TRAN)"
    typ="$(lsblk_p "$line" TYPE)"
    [[ -z "$name" || "$typ" != "disk" ]] && continue
    case "$name" in
      zram*|loop*|ram*|fd*) continue ;;
    esac
    path="/dev/$name"
    if [[ -z "$model" && -r /sys/block/$name/device/model ]]; then
      model="$(trim "$(cat "/sys/block/$name/device/model")")"
    fi
    if [[ -z "$model" && -r /sys/block/$name/device/vendor ]]; then
      model="$(trim "$(cat "/sys/block/$name/device/vendor")") $(trim "$(cat "/sys/block/$name/device/model" 2>/dev/null || true)")"
      model="$(trim "$model")"
    fi
    sched=""
    if [[ -r /sys/block/$name/queue/scheduler ]]; then
      sched="$(tr -d '[]' < "/sys/block/$name/queue/scheduler" | awk '{print $1}')"
    fi
    if have smartctl; then
      run_root smartctl -i "$path" > "$RAW/smart/${name}.txt" 2>&1 || true
      if [[ -z "$model" ]]; then
        model="$(awk -F: '/Device Model|Model Number|Product:/ { gsub(/^[[:space:]]+|[[:space:]]+$/, "", $2); print $2; exit }' "$RAW/smart/${name}.txt")"
      fi
    fi
    size="$(awk -v b="$size" 'BEGIN {
      if (b+0 >= 1099511627776) printf "%.1fT", b/1099511627776
      else if (b+0 >= 1073741824) printf "%.1fG", b/1073741824
      else if (b+0 >= 1048576) printf "%.0fM", b/1048576
      else printf "%s", b
    }')"
    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$name" "$model" "$serial" "$size" "$rota" "$tran" "$sched" >> "$RAW/disks.tsv"
  done < "$RAW/lsblk.txt"

  local models=""
  if [[ -s "$RAW/disks.tsv" ]]; then
    models="$(awk -F '\t' '{ if ($2 != "") printf "%s %s (%s); ", $1, $2, $4; else printf "%s (%s); ", $1, $4 }' "$RAW/disks.tsv")"
    models="${models%; }"
  fi
  hw "disk.summary" "$models"
  log "Disks: ${models:-none found}"
}

collect_network_hw() {
  local iface speed driver pci
  section "Hardware: network"

  ip -br addr > "$RAW/ip-addr.txt" 2>&1 || true
  ip -br link > "$RAW/ip-link.txt" 2>&1 || true
  have lspci && lspci -nn | grep -Ei 'ethernet|network' > "$RAW/lspci-net.txt" 2>&1 || true

  : > "$RAW/nics.tsv"
  local skipped_nics=0
  for iface in /sys/class/net/*; do
    iface="$(basename "$iface")"
    case "$iface" in
      lo|veth*|docker*|br-*|virbr*|cni*|flannel*|tunl*|sit*|dummy*|kube*|cni-*|nodelocaldns)
        skipped_nics=$((skipped_nics + 1))
        continue
        ;;
    esac
    speed=""; driver=""; pci=""
    if [[ -r /sys/class/net/$iface/speed ]]; then
      speed="$(cat "/sys/class/net/$iface/speed" 2>/dev/null || true)"
      [[ "$speed" == "-1" ]] && speed=""
    fi
    if have ethtool; then
      run_root ethtool "$iface" > "$RAW/ethtool-${iface}.txt" 2>&1 || true
      if [[ -z "$speed" ]]; then
        speed="$(awk -F: '/Speed:/ { gsub(/[[:space:]]/, "", $2); print $2; exit }' "$RAW/ethtool-${iface}.txt")"
      fi
      run_root ethtool -i "$iface" > "$RAW/ethtool-i-${iface}.txt" 2>&1 || true
      driver="$(awk -F: '/^driver:/ { gsub(/^[[:space:]]+/, "", $2); print $2; exit }' "$RAW/ethtool-i-${iface}.txt")"
    fi
    if [[ -L /sys/class/net/$iface/device ]]; then
      pci="$(basename "$(readlink -f "/sys/class/net/$iface/device")" 2>/dev/null || true)"
    fi
    printf '%s\t%s\t%s\t%s\n' "$iface" "${speed:-}" "${driver:-}" "${pci:-}" >> "$RAW/nics.tsv"
  done
  hw "net.virtual_ifaces_omitted" "$skipped_nics"
}

collect_system() {
  local os="" kernel="" virt="none" vendor="" product="" hostname_s="" cmdline="" public_ip=""
  section "Hardware: system"

  hostname_s="$(hostname)"
  if [[ -f /etc/os-release ]]; then
    os="$(. /etc/os-release; printf '%s' "${PRETTY_NAME-}")"
  fi
  kernel="$(uname -srm)"
  virt="none"
  if have systemd-detect-virt; then
    virt="$(systemd-detect-virt 2>/dev/null || echo none)"
  elif have virt-what; then
    virt="$(run_root virt-what 2>/dev/null | tr '\n' ' ')"
    virt="$(trim "$virt")"
    [[ -n "$virt" ]] || virt="none"
  fi
  vendor="$(cat /sys/class/dmi/id/sys_vendor 2>/dev/null || true)"
  product="$(cat /sys/class/dmi/id/product_name 2>/dev/null || true)"
  cmdline="$(cat /proc/cmdline 2>/dev/null || true)"

  if [[ -d /sys/devices/system/cpu/vulnerabilities ]]; then
    : > "$RAW/vulnerabilities.txt"
    local f
    for f in /sys/devices/system/cpu/vulnerabilities/*; do
      printf '%s: %s\n' "$(basename "$f")" "$(cat "$f" 2>/dev/null || echo unknown)" >> "$RAW/vulnerabilities.txt"
    done
  fi

  if have curl && [[ "$SKIP_NET" != true ]]; then
    public_ip="$(curl -4 -fsS --max-time 5 https://ifconfig.me 2>/dev/null || \
                 curl -4 -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)"
  fi

  hw "os" "$os"
  hw "kernel" "$kernel"
  hw "hostname" "$hostname_s"
  hw "virt" "$virt"
  hw "dmi.vendor" "$vendor"
  hw "dmi.product" "$product"
  hw "cmdline" "$cmdline"
  hw "public_ip" "$public_ip"
  hw "vendor" "${VENDOR:-$vendor}"
  hw "label" "$LABEL"

  local short
  short="${VENDOR:-${vendor:-$hostname_s}}"
  [[ -n "$LABEL" ]] && short="$short $LABEL"
  hw "label.short" "$short"

  uname -a > "$RAW/uname.txt" 2>&1 || true
  { uptime; printf '\n'; cat /proc/loadavg; } > "$RAW/uptime.txt" 2>&1 || true
  df -hT > "$RAW/df.txt" 2>&1 || true
  cat /proc/swaps > "$RAW/swaps.txt" 2>&1 || true
  cat /proc/cmdline > "$RAW/cmdline.txt" 2>&1 || true

  log "Host: $hostname_s  OS: $os  virt: $virt"
}

sample_host_load() {
  section "Host load sample"
  if have vmstat; then
    vmstat 1 6 > "$RAW/vmstat.txt" 2>&1 || true
    # skip the two header lines and the first data line (since-boot)
    local steal idle
    steal="$(awk 'NR>3 { s+=$16; n++ } END { if (n) printf "%.1f", s/n; else print "n/a" }' "$RAW/vmstat.txt")"
    idle="$(awk 'NR>3 { s+=$15; n++ } END { if (n) printf "%.1f", s/n; else print "n/a" }' "$RAW/vmstat.txt")"
    score "host.steal_pct" "$steal" "%" lower "CPU steal (vmstat 5s)"
    score "host.idle_pct" "$idle" "%" info "CPU idle (vmstat 5s)"
  fi
  local load1
  load1="$(awk '{print $1}' /proc/loadavg)"
  score "host.load1" "$load1" "load" info "load average 1m"
}

# --- benchmarks -----------------------------------------------------------
pick_fio_engine() {
  if ! have fio; then
    FIO_IOENGINE=""
    return
  fi
  if fio --enghelp 2>/dev/null | grep -qw 'libaio'; then
    FIO_IOENGINE="libaio"
  else
    FIO_IOENGINE="psync"
    warn "fio libaio engine not available; falling back to psync"
  fi
}

ensure_disk_space() {
  local dir="$1" need_bytes="$2"
  local avail
  avail="$(df -B1 --output=avail "$dir" | tail -n1 | tr -d ' ')"
  if [[ -n "$avail" && "$avail" -lt "$need_bytes" ]]; then
    die "Not enough free space on $dir (need ~$(fmt0 $((need_bytes/1024/1024))) MiB, have $(fmt0 $((avail/1024/1024))) MiB). Pick another --disk-dir or --output."
  fi
}

detect_tmpfs() {
  local dir="$1"
  local fstype
  fstype="$(df -T "$dir" | awk 'NR==2 {print $2}')"
  if [[ "$fstype" == "tmpfs" || "$fstype" == "ramfs" || "$fstype" == "overlay" ]]; then
    warn "$dir is $fstype — disk numbers will not reflect a real drive. Use --disk-dir on the disk you care about."
  fi
  hw "disk.test_fstype" "$fstype"
  hw "disk.test_dir" "$dir"
}

run_cpu_bench() {
  [[ "$SKIP_CPU" == true ]] && return
  have sysbench || { warn "sysbench not installed; skipping CPU"; return; }

  local n="${THREADS}" t
  if [[ "$QUICK" == true ]]; then t=10; else t=30; fi
  section "CPU: sysbench (prime=20000, ${t}s)"

  log "sysbench cpu single-thread (${t}s)"
  if run_logged sysbench-cpu-1 sysbench cpu --cpu-max-prime=20000 --threads=1 --time="$t" run; then
    parse_sysbench_cpu "$RAW/sysbench-cpu-1.txt" "cpu.single" "CPU 1-thread"
  else
    warn "sysbench cpu single-thread failed"
  fi

  log "sysbench cpu ${n}-thread (${t}s)"
  if run_logged sysbench-cpu-n sysbench cpu --cpu-max-prime=20000 --threads="$n" --time="$t" run; then
    parse_sysbench_cpu "$RAW/sysbench-cpu-n.txt" "cpu.multi" "CPU ${n}-thread"
    score "cpu.multi.threads" "$n" "threads" info "CPU multi-thread count"
  else
    warn "sysbench cpu multi-thread failed"
  fi
}

run_mem_bench() {
  [[ "$SKIP_MEM" == true ]] && return
  local n="${THREADS}"

  if have sysbench; then
    section "Memory: sysbench"
    local total="10G"
    [[ "$QUICK" == true ]] && total="4G"

    log "sysbench memory seq write 1M"
    if run_logged sysbench-mem-seq-write \
        sysbench memory --memory-block-size=1M --memory-total-size="$total" \
        --memory-oper=write --memory-access-mode=seq --threads=1 run; then
      parse_sysbench_mem "$RAW/sysbench-mem-seq-write.txt" "mem.seq_write_1m" "RAM seq write 1M"
    fi

    log "sysbench memory seq read 1M"
    if run_logged sysbench-mem-seq-read \
        sysbench memory --memory-block-size=1M --memory-total-size="$total" \
        --memory-oper=read --memory-access-mode=seq --threads=1 run; then
      parse_sysbench_mem "$RAW/sysbench-mem-seq-read.txt" "mem.seq_read_1m" "RAM seq read 1M"
    fi

    log "sysbench memory rnd write 4K"
    if run_logged sysbench-mem-rnd-write \
        sysbench memory --memory-block-size=4K --memory-total-size="$total" \
        --memory-oper=write --memory-access-mode=rnd --threads=1 run; then
      parse_sysbench_mem "$RAW/sysbench-mem-rnd-write.txt" "mem.rnd_write_4k" "RAM rnd write 4K"
    fi

    if [[ "$QUICK" != true ]]; then
      log "sysbench memory rnd read 4K"
      if run_logged sysbench-mem-rnd-read \
          sysbench memory --memory-block-size=4K --memory-total-size="$total" \
          --memory-oper=read --memory-access-mode=rnd --threads=1 run; then
        parse_sysbench_mem "$RAW/sysbench-mem-rnd-read.txt" "mem.rnd_read_4k" "RAM rnd read 4K"
      fi

      log "sysbench memory seq write 1M x${n}"
      if run_logged sysbench-mem-seq-write-n \
          sysbench memory --memory-block-size=1M --memory-total-size="$total" \
          --memory-oper=write --memory-access-mode=seq --threads="$n" run; then
        parse_sysbench_mem "$RAW/sysbench-mem-seq-write-n.txt" "mem.seq_write_1m_mt" "RAM seq write 1M ${n}t"
      fi
    fi
  else
    warn "sysbench not installed; skipping memory tests"
  fi

  if have mbw; then
    log "mbw (memory bandwidth)"
    local array_mib=128
    [[ "$QUICK" == true ]] && array_mib=32
    if run_logged mbw mbw -n 3 "$array_mib"; then
      local memcpy mcblock
      memcpy="$(awk '/^AVG/ && /MEMCPY/ { print $(NF-1); exit }' "$RAW/mbw.txt")"
      mcblock="$(awk '/^AVG/ && /MCBLOCK/ { print $(NF-1); exit }' "$RAW/mbw.txt")"
      score "mem.mbw_memcpy" "${memcpy:-n/a}" "MiB/s" higher "mbw MEMCPY"
      score "mem.mbw_mcblock" "${mcblock:-n/a}" "MiB/s" higher "mbw MCBLOCK"
    fi
  fi
}

drop_caches() {
  [[ -w /proc/sys/vm/drop_caches ]] || return 0
  sync
  echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || true
}

run_disk_bench() {
  [[ "$SKIP_DISK" == true ]] && return

  section "Disk: fio on $DISK_DIR"
  detect_tmpfs "$DISK_DIR"

  if have hdparm; then
    local src disk
    src="$(findmnt -n -o SOURCE --target "$DISK_DIR" 2>/dev/null || true)"
    if [[ -n "$src" ]]; then
      disk="$(lsblk -n -o PKNAME "$src" 2>/dev/null | head -n1 || true)"
      [[ -z "$disk" ]] && disk="$(lsblk -n -o NAME "$src" 2>/dev/null | head -n1 || true)"
      if [[ -n "$disk" && -b "/dev/$disk" ]]; then
        log "hdparm -Tt /dev/$disk"
        run_logged hdparm run_root hdparm -Tt "/dev/$disk" || true
        local cached buffered
        cached="$(awk '/Timing cached reads/ { print $(NF-1); exit }' "$RAW/hdparm.txt")"
        buffered="$(awk '/Timing buffered disk reads/ { print $(NF-1); exit }' "$RAW/hdparm.txt")"
        [[ -n "$cached" ]] && score "disk.hdparm_cached" "$cached" "MB/s" higher "hdparm cached reads"
        [[ -n "$buffered" ]] && score "disk.hdparm_buffered" "$buffered" "MB/s" higher "hdparm buffered reads"
      fi
    fi
  fi

  have fio || { warn "fio not installed; skipping disk benchmark"; return; }
  pick_fio_engine
  [[ -n "$FIO_IOENGINE" ]] || return

  local runtime="$FIO_RUNTIME" size="$FIO_SIZE" ramp=2
  mkdir -p "$DISK_DIR"
  local work="$DISK_DIR/fio-workdir"
  mkdir -p "$work"
  local testfile="$work/fio-test.bin"
  local need
  need="$(size_to_bytes "$size")"
  ensure_disk_space "$DISK_DIR" $((need + 256*1024*1024))

  hw "disk.fio_size" "$size"
  hw "disk.fio_runtime" "$runtime"
  hw "disk.fio_ioengine" "$FIO_IOENGINE"

  local common=(
    --name=job
    --filename="$testfile"
    --ioengine="$FIO_IOENGINE"
    --direct=1
    --group_reporting
    --time_based
    --runtime="$runtime"
    --ramp_time="$ramp"
    --size="$size"
    --refill_buffers
  )

  log "fio seq write 1M (also creates the ${size} working set)"
  drop_caches
  if run_logged fio-seq-write fio "${common[@]}" --rw=write --bs=1M --iodepth=8 --numjobs=1; then
    record_fio "$RAW/fio-seq-write.txt" "disk.seq_write_1m" "Disk seq write 1M" write
  else
    warn "fio seq write failed"
  fi

  log "fio seq read 1M"
  drop_caches
  if run_logged fio-seq-read fio "${common[@]}" --rw=read --bs=1M --iodepth=8 --numjobs=1; then
    record_fio "$RAW/fio-seq-read.txt" "disk.seq_read_1m" "Disk seq read 1M" read
  else
    warn "fio seq read failed"
  fi

  log "fio 4k randread qd32"
  drop_caches
  if run_logged fio-4k-randread fio "${common[@]}" --rw=randread --bs=4k --iodepth=32 --numjobs=1; then
    record_fio "$RAW/fio-4k-randread.txt" "disk.4k_randread" "Disk 4k randread qd32" read
  else
    warn "fio 4k randread failed"
  fi

  log "fio 4k randwrite qd32"
  drop_caches
  if run_logged fio-4k-randwrite fio "${common[@]}" --rw=randwrite --bs=4k --iodepth=32 --numjobs=1; then
    record_fio "$RAW/fio-4k-randwrite.txt" "disk.4k_randwrite" "Disk 4k randwrite qd32" write
  else
    warn "fio 4k randwrite failed"
  fi

  if [[ "$QUICK" != true ]]; then
    log "fio 4k randrw 50/50 qd32"
    drop_caches
    if run_logged fio-4k-randrw fio "${common[@]}" --rw=randrw --rwmixread=50 --bs=4k --iodepth=32 --numjobs=1; then
      record_fio "$RAW/fio-4k-randrw.txt" "disk.4k_randrw_read" "Disk 4k randrw read" read
      record_fio "$RAW/fio-4k-randrw.txt" "disk.4k_randrw_write" "Disk 4k randrw write" write
    else
      warn "fio 4k randrw failed"
    fi
  fi

  rm -f "$testfile"
}

run_net_bench() {
  [[ "$SKIP_NET" == true ]] && return
  section "Network"

  if have ping; then
    log "ping -c 10 1.1.1.1"
    if run_logged ping-cloudflare ping -c 10 -w 15 -n 1.1.1.1; then
      local avg loss
      avg="$(awk -F'/' '/^rtt|^round-trip/ { print $5; exit }' "$RAW/ping-cloudflare.txt")"
      loss="$(awk -F',' '/packet loss/ { gsub(/[^0-9.]/, "", $3); print $3; exit }' "$RAW/ping-cloudflare.txt")"
      score "net.ping_cf_avg_ms" "${avg:-n/a}" "ms" lower "ping 1.1.1.1 avg"
      score "net.ping_cf_loss_pct" "${loss:-n/a}" "%" lower "ping 1.1.1.1 loss"
    fi
  fi

  local st=""
  if [[ -x "$TMPDIR_BENCH/speedtest" ]]; then
    st="$TMPDIR_BENCH/speedtest"
  elif have speedtest && speedtest --version 2>/dev/null | grep -qi ookla; then
    st="$(command -v speedtest)"
  fi

  if [[ -n "$st" ]]; then
    log "Ookla Speedtest (this uses real internet bandwidth)"
    if run_logged speedtest "$st" --accept-license --accept-gdpr --progress=no; then
      local down up idle loss server isp
      down="$(awk -F: '/Download:/ { gsub(/[[:space:]]/, "", $2); print $2; exit }' "$RAW/speedtest.txt" | sed 's/Mbps//')"
      up="$(awk -F: '/Upload:/ { gsub(/[[:space:]]/, "", $2); print $2; exit }' "$RAW/speedtest.txt" | sed 's/Mbps//')"
      # Official CLI lines look like: "    Download:   940.12 Mbps (data used: 1.2 GB)"
      down="$(awk '/Download:/{ for(i=1;i<=NF;i++) if($i=="Mbps"){ print $(i-1); exit } }' "$RAW/speedtest.txt")"
      up="$(awk '/Upload:/{ for(i=1;i<=NF;i++) if($i=="Mbps"){ print $(i-1); exit } }' "$RAW/speedtest.txt")"
      idle="$(awk '/Idle Latency:/{ for(i=1;i<=NF;i++) if($i=="ms"){ print $(i-1); exit } }' "$RAW/speedtest.txt")"
      [[ -n "$idle" ]] || idle="$(awk '/Latency:/{ for(i=1;i<=NF;i++) if($i=="ms"){ print $(i-1); exit } }' "$RAW/speedtest.txt")"
      loss="$(awk '/Packet Loss:/{ print $3; exit }' "$RAW/speedtest.txt" | tr -d '%')"
      server="$(awk -F: '/Server:/{ sub(/^[[:space:]]+/, "", $2); print $2; exit }' "$RAW/speedtest.txt")"
      isp="$(awk -F: '/ISP:/{ sub(/^[[:space:]]+/, "", $2); print $2; exit }' "$RAW/speedtest.txt")"
      score "net.speedtest_down_mbps" "${down:-n/a}" "Mbps" higher "Speedtest download"
      score "net.speedtest_up_mbps" "${up:-n/a}" "Mbps" higher "Speedtest upload"
      score "net.speedtest_idle_ms" "${idle:-n/a}" "ms" lower "Speedtest idle latency"
      score "net.speedtest_loss_pct" "${loss:-n/a}" "%" lower "Speedtest packet loss"
      hw "net.speedtest_server" "$server"
      hw "net.speedtest_isp" "$isp"
    else
      warn "Ookla Speedtest failed"
    fi
  elif have speedtest-cli; then
    log "speedtest-cli (unofficial Python client)"
    if run_logged speedtest speedtest-cli --simple; then
      local down up ping
      down="$(awk '/Download:/{ print $2; exit }' "$RAW/speedtest.txt")"
      up="$(awk '/Upload:/{ print $2; exit }' "$RAW/speedtest.txt")"
      ping="$(awk '/Ping:/{ print $2; exit }' "$RAW/speedtest.txt")"
      score "net.speedtest_down_mbps" "${down:-n/a}" "Mbps" higher "Speedtest download"
      score "net.speedtest_up_mbps" "${up:-n/a}" "Mbps" higher "Speedtest upload"
      score "net.speedtest_idle_ms" "${ping:-n/a}" "ms" lower "Speedtest ping"
    else
      warn "speedtest-cli failed"
    fi
  else
    warn "No Speedtest client available; skipping throughput test"
  fi

  if [[ -n "$IPERF_HOST" ]]; then
    if have iperf3; then
      local host port
      host="${IPERF_HOST%:*}"
      port="${IPERF_HOST##*:}"
      [[ "$host" == "$port" ]] && port=5201
      log "iperf3 to $host:$port (send)"
      if run_logged iperf-send iperf3 -c "$host" -p "$port" -t 10 -P 4; then
        local send
        send="$(awk '/sender$/ && /bits\/sec/ { print $(NF-2), $(NF-1); last=$0 } END { print last }' "$RAW/iperf-send.txt" | tail -n1)"
        send="$(awk '/sender$/ { for(i=1;i<=NF;i++) if($i ~ /bits\/sec/){ print $(i-2), $(i-1); } }' "$RAW/iperf-send.txt" | tail -n1)"
        hw "net.iperf_send" "$send"
      else
        warn "iperf3 send to $host:$port failed"
      fi
      log "iperf3 to $host:$port (recv)"
      if run_logged iperf-recv iperf3 -c "$host" -p "$port" -t 10 -P 4 -R; then
        local recv
        recv="$(awk '/receiver$/ { for(i=1;i<=NF;i++) if($i ~ /bits\/sec/){ print $(i-2), $(i-1); } }' "$RAW/iperf-recv.txt" | tail -n1)"
        hw "net.iperf_recv" "$recv"
      else
        warn "iperf3 recv to $host:$port failed"
      fi
    else
      warn "iperf3 not installed; skipping --iperf"
    fi
  fi
}

run_crypto_bench() {
  [[ "$SKIP_CRYPTO" == true ]] && return
  have openssl || { warn "openssl not found; skipping crypto"; return; }
  section "Crypto: openssl speed"
  local secs=3
  [[ "$QUICK" == true ]] && secs=1
  log "openssl speed -evp aes-256-cbc / sha256 (${secs}s)"
  if run_logged openssl-speed openssl speed -seconds "$secs" -evp aes-256-cbc sha256 \
     || run_logged openssl-speed openssl speed -seconds "$secs" aes-256-cbc sha256; then
    # numbers are 1000s of bytes/sec; take the 8192-byte column (5th data col)
    local aes sha
    aes="$(awk 'tolower($1) == "aes-256-cbc" { print $6; exit }' "$RAW/openssl-speed.txt" | tr -d 'k')"
    sha="$(awk 'tolower($1) == "sha256" { print $6; exit }' "$RAW/openssl-speed.txt" | tr -d 'k')"
    if is_number "$aes"; then
      aes="$(awk -v n="$aes" 'BEGIN { printf "%.2f", n * 1000 / 1024 / 1024 }')"
    fi
    if is_number "$sha"; then
      sha="$(awk -v n="$sha" 'BEGIN { printf "%.2f", n * 1000 / 1024 / 1024 }')"
    fi
    score "crypto.aes256_8k" "${aes:-n/a}" "MiB/s" higher "openssl AES-256-CBC 8K"
    score "crypto.sha256_8k" "${sha:-n/a}" "MiB/s" higher "openssl SHA-256 8K"
  else
    warn "openssl speed failed"
  fi
}

# --- sanity ---------------------------------------------------------------
sanity_lower() {
  local key="$1" thresh="$2" msg="$3"
  local v
  v="$(score_get "$key")"
  is_number "$v" || return 0
  awk -v v="$v" -v t="$thresh" 'BEGIN { exit !(v < t) }' || return 0
  note_sanity WARN "$msg (got $v, expected ≥ $thresh)"
}

sanity_higher() {
  local key="$1" thresh="$2" msg="$3"
  local v
  v="$(score_get "$key")"
  is_number "$v" || return 0
  awk -v v="$v" -v t="$thresh" 'BEGIN { exit !(v > t) }' || return 0
  note_sanity WARN "$msg (got $v, expected ≤ $thresh)"
}

run_sanity() {
  section "Sanity checks"
  : > "$SANITY_FILE"

  local steal load1 threads
  steal="$(score_get host.steal_pct)"
  load1="$(score_get host.load1)"
  threads="$(hw_get cpu.threads)"
  [[ -z "$threads" ]] && threads="$(nproc)"

  if is_number "$steal" && awk -v v="$steal" 'BEGIN { exit !(v > 10) }'; then
    note_sanity WARN "CPU steal is ${steal}% — noisy neighbor or oversold VPS"
  elif is_number "$steal"; then
    note_sanity OK "CPU steal ${steal}%"
  fi

  if is_number "$load1" && is_number "$threads" && awk -v l="$load1" -v n="$threads" 'BEGIN { exit !(l > n) }'; then
    note_sanity WARN "load1 ${load1} is above thread count ${threads}; results may be noisy"
  fi

  sanity_lower cpu.single.eps 150 "Single-thread CPU looks very slow"
  sanity_lower mem.seq_write_1m 800 "Sequential memory write looks very slow"
  sanity_lower disk.seq_read_1m_mib_s 40 "Sequential disk read looks very slow (HDD-class or stuck)"
  sanity_lower disk.4k_randread_iops 400 "4k random read IOPS look very low for SSD/NVMe"

  local rota nvme_hint
  rota="$(awk -F '\t' '$5==1 { c++ } END { print c+0 }' "$RAW/disks.tsv" 2>/dev/null || echo 0)"
  nvme_hint="$(awk -F '\t' '$6=="nvme" { c++ } END { print c+0 }' "$RAW/disks.tsv" 2>/dev/null || echo 0)"
  if [[ "$nvme_hint" -gt 0 ]]; then
    sanity_lower disk.4k_randread_iops 5000 "NVMe present but 4k random read IOPS are low"
    sanity_lower disk.seq_read_1m_mib_s 200 "NVMe present but sequential read is low"
  elif [[ "$rota" -eq 0 ]]; then
    sanity_lower disk.4k_randread_iops 2000 "Non-rotational disk but 4k random read IOPS are low"
  fi

  sanity_lower net.speedtest_down_mbps 5 "Internet download looks very slow"
  sanity_higher net.ping_cf_avg_ms 200 "Ping to 1.1.1.1 is high"
  sanity_higher host.steal_pct 20 "CPU steal is severe"

  if [[ "$SANITY_FAILS" -eq 0 ]]; then
    note_sanity OK "No automatic red flags. Compare the scoreboard against other vendors."
  fi
}

# --- report ---------------------------------------------------------------
rpt() { printf '%s\n' "$*" >> "$OUTPUT_DIR/report.md"; }

rpt_blank() { printf '\n' >> "$OUTPUT_DIR/report.md"; }

write_report() {
  section "Writing report"
  local report="$OUTPUT_DIR/report.md"
  : > "$report"

  local host os virt vendor_s product cpu ram_s disk_s
  host="$(hw_get hostname)"
  os="$(hw_get os)"
  virt="$(hw_get virt)"
  vendor_s="$(hw_get vendor)"
  product="$(hw_get dmi.product)"
  cpu="$(hw_get cpu.model)"
  ram_s="$(hw_get ram.total_mib) MiB"
  if [[ -n "$(hw_get ram.type)" || -n "$(hw_get ram.speed)" ]]; then
    ram_s="$ram_s $(hw_get ram.type) $(hw_get ram.speed)"
  fi
  disk_s="$(hw_get disk.summary)"

  local elapsed
  elapsed=$((FINISHED_EPOCH - STARTED_EPOCH))

  local one cs cm di down up
  one="${vendor_s:-$host}"
  [[ -n "$LABEL" ]] && one="$one · $LABEL"
  one="$one · ${cpu:-CPU?} · ${ram_s}"
  [[ -n "$disk_s" ]] && one="$one · $disk_s"
  cs="$(score_get cpu.single.eps)"
  cm="$(score_get cpu.multi.eps)"
  di="$(score_get disk.4k_randread_iops)"
  down="$(score_get net.speedtest_down_mbps)"
  up="$(score_get net.speedtest_up_mbps)"
  if [[ "$cs" != "n/a" && -n "$cs" ]]; then
    one="$one · cpu ${cs}/${cm} eps"
  fi
  if [[ "$di" != "n/a" && -n "$di" ]]; then
    one="$one · 4k rr ${di} IOPS"
  fi
  if [[ "$down" != "n/a" && -n "$down" ]]; then
    one="$one · net ${down}/${up} Mbps"
  fi

  rpt "# Server benchmark report"
  rpt_blank
  rpt "\`$one\`"
  rpt_blank
  rpt "Generated by \`${SCRIPT_NAME}\` ${VERSION} on $(date -u -d "@$FINISHED_EPOCH" -Is 2>/dev/null || date -u -Is)."
  rpt_blank
  rpt "## Summary"
  rpt_blank
  rpt "| Field | Value |"
  rpt "| --- | --- |"
  rpt "| Hostname | $(md_escape "$host") |"
  rpt "| Vendor / label | $(md_escape "${vendor_s:-—}") / $(md_escape "${LABEL:-—}") |"
  rpt "| DMI product | $(md_escape "${product:-—}") |"
  rpt "| OS | $(md_escape "$os") |"
  rpt "| Kernel | $(md_escape "$(hw_get kernel)") |"
  rpt "| Virtualization | $(md_escape "${virt:-none}") |"
  rpt "| Public IPv4 | $(md_escape "$(hw_get public_ip)") |"
  local mode="full"
  [[ "$QUICK" == true ]] && mode="quick"
  [[ "$INVENTORY_ONLY" == true ]] && mode="inventory-only"

  rpt "| Started | ${STARTED_ISO} |"
  rpt "| Duration | $(human_duration "$elapsed") |"
  rpt "| Mode | ${mode} |"
  rpt "| fio target | $(md_escape "${DISK_DIR}") |"
  rpt_blank

  rpt "## Hardware"
  rpt_blank
  rpt "### CPU"
  rpt_blank
  rpt "| Field | Value |"
  rpt "| --- | --- |"
  rpt "| Model | $(md_escape "$cpu") |"
  rpt "| Sockets / cores per socket / threads | $(hw_get cpu.sockets) / $(hw_get cpu.cores_per_socket) / $(hw_get cpu.threads) |"
  rpt "| Current / max MHz | $(hw_get cpu.mhz) / $(hw_get cpu.max_mhz) |"
  rpt "| Governor | $(md_escape "$(hw_get cpu.governor)") |"
  rpt "| AES-NI / AVX / AVX2 / AVX-512 | $(hw_get cpu.aes_ni) / $(hw_get cpu.avx) / $(hw_get cpu.avx2) / $(hw_get cpu.avx512) |"
  rpt "| Hardware virt | $(md_escape "$(hw_get cpu.virt_ext)") |"
  rpt "| L1d / L1i / L2 / L3 | $(md_escape "$(hw_get cpu.l1d)") / $(md_escape "$(hw_get cpu.l1i)") / $(md_escape "$(hw_get cpu.l2)") / $(md_escape "$(hw_get cpu.l3)") |"
  rpt_blank

  rpt "### Memory"
  rpt_blank
  rpt "| Field | Value |"
  rpt "| --- | --- |"
  rpt "| Total | $(hw_get ram.total_mib) MiB |"
  rpt "| Type | $(md_escape "$(hw_get ram.type)") |"
  rpt "| Configured speed | $(md_escape "$(hw_get ram.speed)") |"
  rpt "| Modules | $(hw_get ram.modules) |"
  rpt_blank
  if [[ -s "$RAW/memory-modules.tsv" ]]; then
    rpt "| Locator | Size | Type | Speed | Manufacturer | Part |"
    rpt "| --- | --- | --- | --- | --- | --- |"
    awk -F '\t' '{
      gsub(/\|/, "\\|")
      printf "| %s | %s | %s | %s | %s | %s |\n", $1, $2, $3, $4, $5, $6
    }' "$RAW/memory-modules.tsv" >> "$report"
    rpt_blank
  else
    rpt "DIMM-level type and clock were not available. On a VPS this is normal; on a dedicated box rerun as root."
    rpt_blank
  fi

  rpt "### Storage"
  rpt_blank
  if [[ -s "$RAW/disks.tsv" ]]; then
    rpt "| Device | Model | Serial | Size | Rotational | Bus | Scheduler |"
    rpt "| --- | --- | --- | --- | --- | --- | --- |"
    awk -F '\t' '{
      gsub(/\|/, "\\|")
      rot = ($5 == "1") ? "yes" : "no"
      printf "| %s | %s | %s | %s | %s | %s | %s |\n", $1, $2, $3, $4, rot, $6, $7
    }' "$RAW/disks.tsv" >> "$report"
    rpt_blank
  else
    rpt "No disks found via lsblk."
    rpt_blank
  fi
  if [[ -s "$RAW/nvme-list.txt" ]]; then
    rpt '```'
    cat "$RAW/nvme-list.txt" >> "$report"
    rpt '```'
    rpt_blank
  fi

  rpt "### Network interfaces"
  rpt_blank
  if [[ -s "$RAW/nics.tsv" ]]; then
    rpt "| Interface | Link speed | Driver | PCI |"
    rpt "| --- | --- | --- | --- |"
    awk -F '\t' '{
      gsub(/\|/, "\\|")
      printf "| %s | %s | %s | %s |\n", $1, $2, $3, $4
    }' "$RAW/nics.tsv" >> "$report"
    rpt_blank
  fi

  if [[ -s "$RAW/vulnerabilities.txt" ]]; then
    rpt "### CPU vulnerability mitigations"
    rpt_blank
    rpt '```'
    cat "$RAW/vulnerabilities.txt" >> "$report"
    rpt '```'
    rpt_blank
    rpt "Kernel command line:"
    rpt_blank
    rpt '```'
    rpt "$(hw_get cmdline)"
    rpt '```'
    rpt_blank
  fi

  if [[ "$INVENTORY_ONLY" != true ]]; then
    rpt "## Scoreboard"
    rpt_blank
    rpt "Use these numbers to compare vendors. Same flags ⇒ comparable."
    rpt_blank
    rpt "| Metric | Value | Unit |"
    rpt "| --- | --- | --- |"
    awk -F '\t' '$1 != "" && $1 !~ /^#/ && $4 != "info" {
      label = ($5 == "" ? $1 : $5)
      gsub(/\|/, "\\|", label)
      gsub(/\|/, "\\|", $2)
      gsub(/\|/, "\\|", $3)
      printf "| %s | %s | %s |\n", label, $2, $3
    }' "$SCORES_FILE" >> "$report"
    rpt_blank

    rpt "### Rough healthy ranges"
    rpt_blank
    rpt "| Kind | Typical |"
    rpt "| --- | --- |"
    rpt "| CPU 1-thread sysbench prime=20000 | 800–4500 events/s |"
    rpt "| RAM 1M sequential write | 8–40 GiB/s |"
    rpt "| SATA SSD 4k randread qd32 | 10k–100k IOPS |"
    rpt "| NVMe 4k randread qd32 | 50k–600k IOPS |"
    rpt "| NVMe 1M sequential read | 1500–7000 MiB/s |"
    rpt "| HDD 4k randread | 80–250 IOPS |"
    rpt_blank

    rpt "## Sanity"
    rpt_blank
    if [[ -s "$SANITY_FILE" ]]; then
      while IFS=$'\t' read -r level msg; do
        rpt "- **${level}** — ${msg}"
      done < "$SANITY_FILE"
      rpt_blank
    fi
  fi

  rpt "## Cleanup"
  rpt_blank
  if ((${#INSTALLED_PKGS[@]})); then
    rpt "This run installed: \`${INSTALLED_PKGS[*]}\`"
    rpt_blank
    rpt "To remove those packages:"
    rpt_blank
    rpt '```bash'
    rpt "sudo apt-get remove --purge ${INSTALLED_PKGS[*]}"
    rpt "sudo apt-get autoremove --purge"
    rpt '```'
  else
    rpt "No new apt packages were installed by this run."
    if ((${#ALREADY_PKGS[@]})); then
      rpt "Already present (left installed): \`${ALREADY_PKGS[*]}\`"
    fi
  fi
  rpt_blank
  if ((${#FAILED_PKGS[@]})); then
    rpt "Failed to install: \`${FAILED_PKGS[*]}\`. On Ubuntu Server, enable Universe:"
    rpt_blank
    rpt '```bash'
    rpt "sudo apt-get install -y software-properties-common"
    rpt "sudo add-apt-repository -y universe"
    rpt "sudo apt-get update"
    rpt '```'
    rpt_blank
  fi
  if [[ "$KEEP_TEMP" == true ]]; then
    rpt "Temp downloads kept in \`${TMPDIR_BENCH}\`."
  else
    rpt "Downloaded binaries were removed from a temp directory after the run."
  fi
  rpt "Report directory: \`${OUTPUT_DIR}\`."
  rpt_blank
  rpt "Compare two vendors later:"
  rpt_blank
  rpt '```bash'
  rpt "$SCRIPT_NAME --compare $OUTPUT_DIR /path/to/other-report"
  rpt '```'
  rpt_blank

  if [[ "$INVENTORY_ONLY" != true ]]; then
    rpt "## Raw logs"
    rpt_blank
    rpt "Full command output is under \`raw/\` next to this report."
    rpt_blank
  fi

  printf '%s\n' "$one" > "$OUTPUT_DIR/one-liner.txt"
}

print_cleanup_hint() {
  log ""
  if ((${#INSTALLED_PKGS[@]})); then
    log "Packages this script installed: ${INSTALLED_PKGS[*]}"
    log "Cleanup:"
    log "  sudo apt-get remove --purge ${INSTALLED_PKGS[*]}"
    log "  sudo apt-get autoremove --purge"
  else
    log "No new apt packages were installed."
  fi
  if [[ "$KEEP_TEMP" == true && -n "$TMPDIR_BENCH" ]]; then
    log "Temp dir kept: $TMPDIR_BENCH"
  fi
}

print_scoreboard() {
  [[ -f "$SCORES_FILE" ]] || return 0
  awk -F '\t' '$4 != "info" && $1 !~ /^#/ && $1 != "" { found=1; exit } END { exit !found }' "$SCORES_FILE" || return 0
  printf '\n'
  printf '%sScoreboard%s\n' "$C_BOLD" "$C_RESET"
  {
    printf 'Metric\tValue\tUnit\n'
    awk -F '\t' '$4 != "info" && $1 !~ /^#/ { printf "%s\t%s\t%s\n", ($5==""?$1:$5), $2, $3 }' "$SCORES_FILE"
  } | {
    if have column; then
      column -t -s $'\t'
    else
      cat
    fi
  }
  printf '\n'
  if [[ -f "$OUTPUT_DIR/one-liner.txt" ]]; then
    printf '%s\n' "$(cat "$OUTPUT_DIR/one-liner.txt")"
  fi
  printf '\nReport: %s/report.md\n' "$OUTPUT_DIR"
}

# --- lifecycle ------------------------------------------------------------
cleanup() {
  local work
  if [[ -n "${DISK_DIR:-}" ]]; then
    work="$DISK_DIR/fio-workdir"
    rm -f "$work"/fio-test.bin "$work"/fio-*.bin 2>/dev/null || true
    rmdir "$work" 2>/dev/null || true
  fi
  if [[ "$KEEP_TEMP" != true && -n "${TMPDIR_BENCH:-}" && -d "$TMPDIR_BENCH" ]]; then
    rm -rf "$TMPDIR_BENCH"
  fi
}

on_signal() {
  INTERRUPTED=true
  printf '\nInterrupted. Cleaning up — press Ctrl-C again to force.\n' >&2
  exit 130
}

setup_dirs() {
  local host ts
  host="$(hostname -s 2>/dev/null || hostname)"
  ts="$(date +%Y%m%d-%H%M%S)"
  if [[ -z "$OUTPUT_DIR" ]]; then
    OUTPUT_DIR="./bench-${host}-${ts}"
  fi
  mkdir -p "$OUTPUT_DIR"
  OUTPUT_DIR="$(cd "$OUTPUT_DIR" && pwd)"
  RAW="$OUTPUT_DIR/raw"
  mkdir -p "$RAW"
  SCORES_FILE="$OUTPUT_DIR/scores.tsv"
  HW_FILE="$OUTPUT_DIR/hw.tsv"
  SANITY_FILE="$OUTPUT_DIR/sanity.tsv"
  : > "$SCORES_FILE"
  : > "$HW_FILE"
  : > "$SANITY_FILE"
  printf '# key\tvalue\tunit\tbetter\tlabel\n' > "$SCORES_FILE"

  TMPDIR_BENCH="$(mktemp -d "${TMPDIR:-/tmp}/benchmark-all-the-things.XXXXXX")"

  if [[ -z "$DISK_DIR" ]]; then
    DISK_DIR="$OUTPUT_DIR"
  else
    mkdir -p "$DISK_DIR"
    DISK_DIR="$(cd "$DISK_DIR" && pwd)"
  fi

  if [[ -z "$THREADS" ]]; then
    THREADS="$(nproc)"
  fi
  if [[ -z "$FIO_SIZE" ]]; then
    if [[ "$QUICK" == true ]]; then FIO_SIZE="512M"; else FIO_SIZE="2G"; fi
  fi
  if [[ -z "$FIO_RUNTIME" ]]; then
    if [[ "$QUICK" == true ]]; then FIO_RUNTIME=10; else FIO_RUNTIME=30; fi
  fi

  {
    printf 'version=%s\n' "$VERSION"
    printf 'hostname=%s\n' "$host"
    printf 'started=%s\n' "$STARTED_ISO"
    printf 'quick=%s\n' "$QUICK"
    printf 'vendor=%s\n' "$VENDOR"
    printf 'label=%s\n' "$LABEL"
    printf 'threads=%s\n' "$THREADS"
    printf 'fio_size=%s\n' "$FIO_SIZE"
    printf 'fio_runtime=%s\n' "$FIO_RUNTIME"
    printf 'disk_dir=%s\n' "$DISK_DIR"
  } > "$OUTPUT_DIR/meta.env"
}

print_plan() {
  log "Report directory : $OUTPUT_DIR"
  log "Disk test dir    : $DISK_DIR"
  log "Threads          : $THREADS"
  log "fio size/runtime : $FIO_SIZE / ${FIO_RUNTIME}s"
  local mode="full"
  [[ "$QUICK" == true ]] && mode="quick"
  [[ "$INVENTORY_ONLY" == true ]] && mode="inventory-only"
  log "Mode             : $mode"
  if ((${#NEED_PKGS[@]})); then
    if [[ "$NO_INSTALL" == true ]]; then
      log "Missing packages : ${NEED_PKGS[*]} (not installing)"
    else
      log "Will install     : ${NEED_PKGS[*]}"
    fi
  else
    log "Will install     : (nothing — already present)"
  fi
}

run_inventory() {
  collect_system
  collect_cpu
  collect_memory
  collect_disks
  collect_network_hw
}

run_benchmarks() {
  sample_host_load
  run_cpu_bench
  run_mem_bench
  run_disk_bench
  run_crypto_bench
  run_net_bench
  run_sanity
}

main() {
  parse_args "$@"

  if ((${#COMPARE_DIRS[@]})); then
    run_compare
    return 0
  fi

  trap cleanup EXIT
  trap on_signal INT TERM

  require_ubuntu
  STARTED_EPOCH="$(date +%s)"
  STARTED_ISO="$(date -Is)"

  if [[ "$DRY_RUN" == true ]]; then
    [[ -n "$THREADS" ]] || THREADS="$(nproc)"
    [[ -n "$FIO_SIZE" ]] || { [[ "$QUICK" == true ]] && FIO_SIZE="512M" || FIO_SIZE="2G"; }
    [[ -n "$FIO_RUNTIME" ]] || { [[ "$QUICK" == true ]] && FIO_RUNTIME=10 || FIO_RUNTIME=30; }
    [[ -n "$OUTPUT_DIR" ]] || OUTPUT_DIR="./bench-$(hostname -s 2>/dev/null || hostname)-TIMESTAMP"
    [[ -n "$DISK_DIR" ]] || DISK_DIR="$OUTPUT_DIR"
    plan_packages
    print_plan
    log "Dry run complete. No packages installed, no directories created, no tests run."
    return 0
  fi

  setup_privileges
  setup_dirs
  plan_packages
  print_plan

  install_packages

  if [[ "$SKIP_NET" != true && "$INVENTORY_ONLY" != true ]]; then
    download_speedtest || true
  fi

  run_inventory

  if [[ "$INVENTORY_ONLY" != true ]]; then
    run_benchmarks
  fi

  FINISHED_EPOCH="$(date +%s)"
  write_report
  print_scoreboard
  print_cleanup_hint

  if [[ "$INTERRUPTED" == true ]]; then
    return 130
  fi
}

main "$@"
