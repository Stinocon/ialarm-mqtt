# iAlarm to MQTT bridge

🚀 **Enhanced MQTT bridge for iAlarm with critical bug fixes and coexistence support.**

A MQTT bridge for iAlarm (https://www.antifurtocasa365.it/) and other Chinese "TCP IP" alarm systems like Meian and Emooluxr (via `ialarm` library).

## 🆚 Enhanced vs Original

This fork provides **critical fixes and improvements** over the original:

| Feature | Original | Enhanced Version |
|---------|----------|------------------|
| **Bugs #45 & #51** | ❌ Entity flip-flop, HA 2024.2+ issues | ✅ **FIXED** |
| **Entity Naming** | ❌ Ugly _2, _3, _4 suffixes | ✅ **Clean descriptive names** |
| **MQTT Prefix** | Fixed `ialarm` | ✅ **Configurable** (default: `ialarm-v2`) |
| **Unique IDs** | May conflict | ✅ **Suffix support** (`_ialarmv2`) |
| **Device Naming** | Generic | ✅ **Customizable suffix** |
| **Manufacturer** | Fixed `Meian` | ✅ **Configurable branding** |
| **Arm modes** | Full list (shows Night/Vacation/Custom buttons) | ✅ **Configurable `supported_features`** (default Home/Away) |
| **Zone ID mapping** | ❌ Not exposed | ✅ **Zone ID sensor + `id → name` directory** (`zoneId` feature) |
| **Connection** | Single connection only | ⚠️ **Single connection only** (hardware limitation) |

> ⚠️ **Disclaimer — "vibecoded" fork.** All enhancements and fixes in this fork (vs the
> original [maxill1/ialarm-mqtt](https://github.com/maxill1/ialarm-mqtt)) were *vibecoded*:
> developed with AI assistance rather than hand-written by a maintainer with deep knowledge
> of the codebase. They are tested as documented and work for the maintainer's setup, but
> use them at your own risk.

## 🔧 Coexistence Configuration

**IMPORTANT:** The iAlarm central unit allows only **one connection at a time**. You cannot run both the original and this enhanced version simultaneously.

**However,** this enhanced version provides better configuration options and can replace the original addon:

```yaml
branding:
  prefix: "ialarm-v2"              # MQTT topic prefix (vs "ialarm")
  uniqueIdSuffix: "_ialarmv2"      # Prevents HA entity conflicts  
  deviceNameSuffix: " (ialarm)"    # UI clarity
  manufacturer: "Antifurto365"     # Custom manufacturer
```

**Result:** Topics use `ialarm-v2/*` instead of `ialarm/*`, devices show as "iAlarm Security Panel (ialarm)", and all entities have unique identifiers.

## Features
- arm home
- arm away
- disarm
- zone info (ok/problem, open, alarm, bypass, fault, low battery, signal loss)
  - Note: to obtain "open" in real time enable DoorDetect ("Ispezione sensori porta") in the panel options (`http://192.168.1.x/Option.htm`).
- Home Assistant [MQTT Discovery](https://www.home-assistant.io/docs/mqtt/discovery/)
- configurable arm modes via `hadiscovery.supportedFeatures` (default `["arm_home", "arm_away"]`) — hides the unused Night/Vacation/Custom-bypass buttons in HA
- zone ID indicators (enable the `zoneId` feature):
  - a diagnostic **Zone ID** sensor on each zone device (the panel zone number, e.g. `6`)
  - a global **zone directory** sensor on the alarm device whose attributes hold the full `id → name` map (published retained to `{prefix}/zones/directory`), handy for automations such as "which open zone is blocking arming?"
  - both ship with clean default entity IDs (`sensor.<zone>_ialarm_id_zona`, `sensor.ialarm_zone_directory`) via `default_entity_id`. HA only applies this on first creation, so delete any previously-created zone ID entities once to have them recreated with the clean IDs.

## Quick start
1) Install (npx / npm -g / Docker): see the wiki
- Installation: https://github.com/maxill1/ialarm-mqtt/wiki/Installation

2) Configure
- Copy and edit `templates/tmpl.config.yaml` (or use the generated `templates/full.config.yaml`)
- Docs: https://github.com/maxill1/ialarm-mqtt/wiki/Configuration

3) Run
```bash
node ./bin/ialarm-mqtt.js -c /path/to/config/folder
```

## Home Assistant integration
- Discovery is automatic if enabled in config.
- Entities have stable `unique_id`; HA will keep the same `entity_id` across restarts.
- Docs and examples: https://github.com/maxill1/ialarm-mqtt/wiki/Home-Assistant-Integration

### Discovery topics and controls
- Reset/trigger discovery via MQTT (see `topics.alarm.*` in config):
  - `{prefix}/alarm/discovery` (publish any payload) - default: `ialarm-v2/alarm/discovery`
    - with payload evaluating to ON/True → performs cleanup then publishes discovery
    - with discovery disabled in config → performs cleanup only
  - `{prefix}/alarm/resetCache` → clears internal cache and republishes states - default: `ialarm-v2/alarm/resetCache`

**Note:** Replace `{prefix}` with your configured `branding.prefix` value (default: `ialarm-v2`).

Behavior notes:
- On start, a cleanup is sent once; the actual discovery is sent once (guarded) with a short delay to let HA process the cleanup.
- Rapid re-triggers are ignored during a short cooldown to prevent duplicate discovery.

## Breaking change compliance (HA 2024.2+ naming rules)
Home Assistant 2024.2+ forbids entity names equal to, or starting with, the device name. This project now:
- Uses a more specific device name (defaults to `iAlarm Security Panel` if not provided)
- Removes device/type prefixes from entity display names (e.g. switches are now `Discovery Reset`, `Cache Reset`, `Clear Triggered`)
- Keeps `unique_id` stable so existing `entity_id` are preserved by HA

If HA had previously nulled names due to violations, new compliant names will be applied on next discovery.

## 🔗 Repository Links

- **Enhanced Source Code:** https://github.com/Stinocon/ialarm-mqtt
- **Home Assistant Add-on:** https://github.com/Stinocon/addons
- **Original Repository:** https://github.com/maxill1/ialarm-mqtt

## Changelog

See the [git tags / releases](https://github.com/Stinocon/ialarm-mqtt/tags) and commit history
for the full version history. The packaged add-on also keeps a user-facing changelog in
[`addons/ialarm-mqtt/CHANGELOG.md`](https://github.com/Stinocon/addons/blob/master/ialarm-mqtt/CHANGELOG.md).

## Troubleshooting
Common issues and hints: https://github.com/maxill1/ialarm-mqtt/wiki/Troubleshooting

## License
MIT
