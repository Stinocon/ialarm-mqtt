# iAlarm to MQTT bridge

🚀 **Enhanced MQTT bridge for iAlarm with critical bug fixes and coexistence support.**

A MQTT bridge for iAlarm (https://www.antifurtocasa365.it/) and other Chinese "TCP IP" alarm systems like Meian and Emooluxr (via `ialarm` library).

## 🆚 Stinocon vs Original

This fork provides **critical fixes and coexistence features** missing from the original:

| Feature | Original | Stinocon Enhanced |
|---------|----------|-------------------|
| **Bugs #45 & #51** | ❌ Entity flip-flop, HA 2024.2+ issues | ✅ **FIXED** |
| **Coexistence** | ❌ Conflicts with other instances | ✅ **Side-by-side deployment** |
| **MQTT Prefix** | Fixed `ialarm` | ✅ **Configurable** (default: `ialarm-v2`) |
| **Unique IDs** | May conflict | ✅ **Suffix support** (`_stinocon`) |
| **Device Naming** | Generic | ✅ **Customizable suffix** |
| **Manufacturer** | Fixed `Meian` | ✅ **Configurable branding** |

## 🔧 Coexistence Configuration

**NEW:** Configure custom branding to avoid conflicts:

```yaml
branding:
  prefix: "ialarm-v2"              # MQTT topic prefix (vs "ialarm")
  uniqueIdSuffix: "_stinocon"      # Prevents HA entity conflicts  
  deviceNameSuffix: " (Stinocon)"  # UI clarity
  manufacturer: "Stinocon Mods"    # Custom manufacturer
```

**Result:** Topics use `ialarm-v2/*` instead of `ialarm/*`, devices show as "iAlarm Security Panel (Stinocon)", and all entities have unique identifiers.

<a href="https://www.buymeacoffee.com/maxill1" target="_blank">
<img src="https://www.buymeacoffee.com/assets/img/guidelines/download-assets-sm-2.svg" alt="Buy Me A Coffee"></a>

## Features
- arm home
- arm away
- disarm
- zone info (ok/problem, open, alarm, bypass, fault, low battery, signal loss)
  - Note: to obtain "open" in real time enable DoorDetect ("Ispezione sensori porta") in the panel options (`http://192.168.1.x/Option.htm`).
- Home Assistant [MQTT Discovery](https://www.home-assistant.io/docs/mqtt/discovery/)

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

## Changelog (highlights)
- **0.12.3** (Stinocon Enhanced)
  - **BREAKING:** Enable coexistence with original ialarm-mqtt addon
  - feat: configurable MQTT prefix via `branding.prefix` (default: "ialarm-v2")
  - feat: configurable unique_id suffix via `branding.uniqueIdSuffix` 
  - feat: configurable device name suffix via `branding.deviceNameSuffix`
  - feat: configurable manufacturer via `branding.manufacturer`
  - fix: allow side-by-side deployment with upstream addon using different prefixes
- 0.12.2
  - Fix: prevent duplicate HA discovery publishes (eliminates entity name flip-flop)
  - Fix: comply with HA 2024.2+ entity naming rules
  - Add: structured logs for discovery topics and `unique_id`
- 0.12.1
  - Internal improvements and logging

Full history in Git tags and commit messages.

## Troubleshooting
Common issues and hints: https://github.com/maxill1/ialarm-mqtt/wiki/Troubleshooting

## License
MIT
