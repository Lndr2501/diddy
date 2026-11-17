#!/usr/bin/env bash
# Compiles and runs the Foundation-only rule checks in ios/Tools/*_check, several at once.
# CI (Build iOS, job `checks`) and local runs use this list; add a new check here.
#
#   ios/Tools/run-checks.sh                 all checks
#   ios/Tools/run-checks.sh dnd_check ...   only these
#   JOBS=1 ios/Tools/run-checks.sh          one at a time
#
# Each line: tool folder | Diddy sources it compiles with | arguments (relative to ios/).
set -u
cd "$(dirname "$0")/.."

CHECKS='
reaction_check|Diddy/Matrix/ReactionEmoji.swift|
streamzoom_check|Diddy/Call/StreamZoom.swift|
stagelayout_check|Diddy/Call/CallStageLayout.swift|
avatar_check|Diddy/Matrix/AvatarChoice.swift|
presence_check|Diddy/Matrix/PresenceLogic.swift|
profiledecor_check|Diddy/Matrix/DiddyProfileDecor.swift|
swipereply_check|Diddy/UI/SwipeReplyMath.swift|
scrollanchor_check|Diddy/UI/ChatScrollAnchorRules.swift|
timeline_check|Diddy/Matrix/TimelineLayout.swift|
profile_editor_check|Diddy/Matrix/DiddyJSONSize.swift Diddy/Matrix/DiddyProfileDecor.swift Diddy/Matrix/DiddyProfileDraft.swift|
locale_check|Diddy/App/LocaleRules.swift|
appearance_check|Diddy/App/AppearanceLogic.swift|
botcard_check|Diddy/Matrix/BotCard.swift|
sentmedia_check|Diddy/Matrix/SentMedia.swift|
companion_check|Diddy/Call/CompanionProtocol.swift|
pushtotalk_check|Diddy/Call/PushToTalkLogic.swift|
broadcastwire_check|Diddy/Call/BroadcastWire.swift|
registration_check|Diddy/Matrix/RegistrationLogic.swift|
markerchecks_check|Diddy/Matrix/DiddyMarkerChecks.swift|
musiccard_check|Diddy/Matrix/MusicCard.swift Diddy/App/ShareHandoff.swift|
composer_check|Diddy/Matrix/DesktopMarkdown.swift Diddy/Matrix/EmojiData.swift Diddy/Matrix/ComposerLogic.swift|
dateformat_check|Diddy/App/DateFormatRules.swift|
dnd_check|Diddy/Matrix/DoNotDisturb.swift|
sendlater_check|Diddy/Matrix/SendLaterLogic.swift|
soundboardsync_check|Diddy/Call/SoundboardSyncLogic.swift|
retention_check|Diddy/Matrix/RoomRetention.swift|../docs/fixtures/retention.json
messagesearch_check|Diddy/Matrix/MessageSearchLogic.swift|
oggopus_check|Diddy/Matrix/OpusContainer.swift Diddy/Matrix/OpusCAFWriter.swift Diddy/Matrix/VoiceCache.swift|
pushrules_check|Diddy/Matrix/PushRuleLogic.swift|
quickswitch_check|Diddy/Matrix/QuickSwitchLogic.swift|
roomlist_check|Diddy/Matrix/RoomListLogic.swift|
roomsettings_check|Diddy/Matrix/RoomSettingsLogic.swift Diddy/Matrix/RoomRetention.swift|
security_check|Diddy/Matrix/SecurityLogic.swift|
accountcleanup_check|Diddy/Matrix/AccountCleanupLogic.swift|
shell_check|Diddy/App/ShellLogic.swift|
timelinenav_check|Diddy/Matrix/TimelineNavLogic.swift|
timeout_check|Diddy/Matrix/HomeserverTimeout.swift|
watchtogether_check|Diddy/Call/WatchTogetherLogic.swift|
call_audio_check|Diddy/Call/CallAudioLogic.swift Diddy/Call/CallVolumeMemory.swift Diddy/Call/CallReactionLogic.swift Diddy/Call/AgentVoice.swift|
callkeys_check|Diddy/Call/CallKeyLogic.swift|
richtext_check|Diddy/Matrix/RichText.swift Diddy/Matrix/MessageEmbeds.swift|
badge_check|Diddy/Matrix/DiddyJSONSize.swift Diddy/Matrix/DiddyEvents.swift Diddy/Matrix/DiddyTrust.swift Diddy/Matrix/DiddyProfileDecor.swift Diddy/Matrix/DiddyProfileDraft.swift Diddy/Matrix/DiddyBadgeLogic.swift|
diddyzip_check|Diddy/Matrix/DiddyJSONSize.swift Diddy/Matrix/DiddyProfileDecor.swift Diddy/Matrix/DiddyProfileDraft.swift Diddy/Matrix/DiddyZip.swift Diddy/Matrix/DiddyDecorImport.swift|
optionsroom_check|Diddy/Matrix/DiddyJSONSize.swift Diddy/Matrix/DiddyEvents.swift Diddy/Matrix/DiddyOptionsRoomLogic.swift|
profiletransfer_check|Diddy/Matrix/DiddyJSONSize.swift Diddy/Matrix/DiddyProfileDecor.swift Diddy/Matrix/DiddyProfileDraft.swift Diddy/Matrix/DiddyProfileTransfer.swift|
'

jobs=${JOBS:-$(sysctl -n hw.ncpu 2>/dev/null || nproc 2>/dev/null || echo 2)}
out=$(mktemp -d "${TMPDIR:-/tmp}/diddy-checks.XXXXXX")
trap 'rm -rf "$out"' EXIT

# One check: compile, run, keep its output and exit code for the report.
run_one() {
  local tool=$1 sources=$2 args=$3 log="$out/$1.log"
  # shellcheck disable=SC2086 # source and argument lists are space separated on purpose
  local status
  if swiftc -swift-version 5 $sources "Tools/$tool/main.swift" -o "$out/$tool" >"$log" 2>&1; then
    "$out/$tool" $args >>"$log" 2>&1
    status=$?
  else
    status=$?
    echo "($tool did not compile)" >>"$log"
  fi
  echo "$status" >"$out/$tool.status"
}

selected=$*
listed=''
running=0
while IFS='|' read -r tool sources args; do
  [ -n "$tool" ] || continue
  listed="$listed $tool"
  if [ -n "$selected" ] && ! printf ' %s ' "$selected" | grep -q " $tool "; then continue; fi
  run_one "$tool" "$sources" "$args" &
  running=$((running + 1))
  if [ "$running" -ge "$jobs" ]; then
    # bash >= 4.3 waits for any one check; older bash (macOS /bin/bash 3.2) for the whole batch
    if wait -n 2>/dev/null; then running=$((running - 1)); else wait; running=0; fi
  fi
done <<EOF
$CHECKS
EOF
wait

# Every check folder must be in the list, or CI would silently skip it.
missing=''
for dir in Tools/*_check; do
  case " $listed " in *" $(basename "$dir") "*) ;; *) missing="$missing $(basename "$dir")" ;; esac
done

failed=''
for status in "$out"/*.status; do
  [ -e "$status" ] || continue
  tool=$(basename "$status" .status)
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::group::$tool"; else echo "== $tool"; fi
  cat "$out/$tool.log"
  [ -n "${GITHUB_ACTIONS:-}" ] && echo "::endgroup::"
  [ "$(cat "$status")" = 0 ] || failed="$failed $tool"
done

if [ -n "$missing" ]; then
  echo "error: not in ios/Tools/run-checks.sh:$missing"
  exit 1
fi
if [ -n "$failed" ]; then
  for tool in $failed; do
    echo "${GITHUB_ACTIONS:+::error::}$tool failed"
    tail -n 30 "$out/$tool.log"
  done
  exit 1
fi
echo "all $(ls "$out"/*.status | wc -l | tr -d ' ') iOS checks passed"
