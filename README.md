# ialarm-mqtt
A MQTT bridge for iAlarm (https://www.antifurtocasa365.it/) and other Chinese "TCP IP" alarm systems like Meian and Emooluxr (via `ialarm` library).

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
  - `ialarm/alarm/discovery` (publish any payload)
    - with payload evaluating to ON/True → performs cleanup then publishes discovery
    - with discovery disabled in config → performs cleanup only
  - `ialarm/alarm/resetCache` → clears internal cache and republishes states

Behavior notes:
- On start, a cleanup is sent once; the actual discovery is sent once (guarded) with a short delay to let HA process the cleanup.
- Rapid re-triggers are ignored during a short cooldown to prevent duplicate discovery.

## Breaking change compliance (HA 2024.2+ naming rules)
Home Assistant 2024.2+ forbids entity names equal to, or starting with, the device name. This project now:
- Uses a more specific device name (defaults to `iAlarm Security Panel` if not provided)
- Removes device/type prefixes from entity display names (e.g. switches are now `Discovery Reset`, `Cache Reset`, `Clear Triggered`)
- Keeps `unique_id` stable so existing `entity_id` are preserved by HA

If HA had previously nulled names due to violations, new compliant names will be applied on next discovery.

## Changelog (highlights)
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
