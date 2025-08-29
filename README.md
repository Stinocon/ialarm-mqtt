# 🏠 iAlarm MQTT Bridge

A modern, secure, and feature-rich MQTT bridge for iAlarm systems with a beautiful web interface. This project transforms your iAlarm system into a smart home integration powerhouse.

![Version](https://img.shields.io/badge/version-0.12.0-blue.svg)
![Node.js](https://img.shields.io/badge/node.js-18+-green.svg)
![License](https://img.shields.io/badge/license-MIT-yellow.svg)
![Docker](https://img.shields.io/badge/docker-ready-blue.svg)

## ✨ Features

### 🔐 Alarm Control
- **Arm Home** - Secure your home while you're inside
- **Arm Away** - Full security when you're out
- **Disarm** - Quick and secure disarming
- **Real-time Status** - Live alarm system status

### 🏘️ Zone Monitoring
- **Zone Status** - Real-time zone information (OK/Problem/Open)
- **Zone Names** - Custom zone naming support
- **Visual Indicators** - Beautiful zone status display
- **Event Logging** - Complete zone activity history

### 🌐 Web Interface
- **Modern Dashboard** - Beautiful, responsive web interface
- **Real-time Updates** - WebSocket-powered live updates
- **Mobile Friendly** - Works perfectly on all devices
- **Dark/Light Themes** - User preference support

### 🔌 MQTT Integration
- **Home Assistant Discovery** - Automatic device discovery
- **MQTT 5.x Support** - Latest MQTT protocol
- **Persistent Discovery** - Survives container restarts
- **Custom Topics** - Flexible topic configuration

### 📊 Monitoring & Health
- **Health Monitoring** - System health tracking
- **Prometheus Metrics** - Production-ready metrics
- **Error Recovery** - Automatic reconnection
- **Performance Tracking** - Response time monitoring

### 🛡️ Security & Reliability
- **Secure Dependencies** - All vulnerabilities patched
- **Non-root Container** - Security-first approach
- **Graceful Shutdown** - Proper signal handling
- **Error Handling** - Comprehensive error recovery

## 🚀 Quick Start

### Docker (Recommended)

```bash
# Pull the latest image
docker pull stinocon/ialarm-mqtt:latest

# Create configuration directory
mkdir -p /config/ialarm-mqtt

# Create configuration file
cat > /config/ialarm-mqtt/config.json << EOF
{
  "server": {
    "host": "192.168.1.100",
    "port": 8080,
    "username": "admin",
    "password": "your_password",
    "zones": [1, 2, 3, 4, 5, 6, 7, 8]
  },
  "mqtt": {
    "host": "192.168.1.10",
    "port": 1883,
    "username": "mqtt_user",
    "password": "mqtt_password",
    "topic": "ialarm"
  },
  "pollingInterval": 30000,
  "webPort": 3000,
  "debug": false
}
EOF

# Run the container
docker run -d \
  --name ialarm-mqtt \
  --restart unless-stopped \
  -p 3000:3000 \
  -v /config/ialarm-mqtt:/config \
  stinocon/ialarm-mqtt:latest
```

### Web Interface

Once running, access the web interface at: `http://localhost:3000`

## 📋 Configuration

### Basic Configuration

```json
{
  "server": {
    "host": "192.168.1.100",
    "port": 8080,
    "username": "admin",
    "password": "your_password",
    "zones": [1, 2, 3, 4, 5, 6, 7, 8]
  },
  "mqtt": {
    "host": "192.168.1.10",
    "port": 1883,
    "username": "mqtt_user",
    "password": "mqtt_password",
    "topic": "ialarm"
  },
  "pollingInterval": 30000,
  "webPort": 3000,
  "debug": false
}
```

### Advanced Configuration

```json
{
  "server": {
    "host": "192.168.1.100",
    "port": 8080,
    "username": "admin",
    "password": "your_password",
    "zones": [1, 2, 3, 4, 5, 6, 7, 8]
  },
  "mqtt": {
    "host": "192.168.1.10",
    "port": 1883,
    "username": "mqtt_user",
    "password": "mqtt_password",
    "topic": "ialarm",
    "retain": true,
    "qos": 1
  },
  "features": {
    "zoneNames": true,
    "homeAssistant": true,
    "persistentDiscovery": true
  },
  "pollingInterval": 30000,
  "webPort": 3000,
  "debug": false,
  "logLevel": "info"
}
```

## 🏠 Home Assistant Integration

### Automatic Discovery

The bridge automatically creates Home Assistant devices when `homeAssistant: true` is enabled in configuration.

### Manual Configuration

```yaml
# configuration.yaml
mqtt:
  alarm_control_panel:
    - name: "iAlarm"
      state_topic: "ialarm/status"
      command_topic: "ialarm/command"
      availability_topic: "ialarm/available"
      payload_arm_away: "arm_away"
      payload_arm_home: "arm_home"
      payload_disarm: "disarm"
      state_armed_away: "armed_away"
      state_armed_home: "armed_home"
      state_disarmed: "disarmed"
```

## 🔧 Development

### Prerequisites

- Node.js 18+
- npm 8+

### Local Development

```bash
# Clone the repository
git clone https://github.com/Stinocon/ialarm-mqtt.git
cd ialarm-mqtt

# Install dependencies
npm install

# Start development mode
npm run dev

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format
```

### Building Docker Image

```bash
# Build the image
docker build -t ialarm-mqtt .

# Run locally
docker run -p 3000:3000 -v ./config:/config ialarm-mqtt
```

## 📊 API Reference

### REST API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | System health status |
| `/api/metrics` | GET | Prometheus metrics |
| `/api/status` | GET | Alarm system status |
| `/api/zones` | GET | Zone information |
| `/api/events` | GET | Recent events |
| `/api/config` | GET | Current configuration |
| `/api/alarm/arm` | POST | Arm alarm system |
| `/api/alarm/disarm` | POST | Disarm alarm system |

### WebSocket Events

| Event | Description |
|-------|-------------|
| `status` | Alarm status updates |
| `zones` | Zone status updates |
| `events` | Event log updates |
| `health` | Health metrics updates |

## 🐳 Docker Compose

```yaml
version: '3.8'

services:
  ialarm-mqtt:
    image: stinocon/ialarm-mqtt:latest
    container_name: ialarm-mqtt
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - ./config:/config
      - ./logs:/logs
    environment:
      - NODE_ENV=production
      - LOG_LEVEL=info
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

## 🔍 Troubleshooting

### Common Issues

1. **Connection Failed**
   - Verify alarm panel IP and port
   - Check username/password
   - Ensure network connectivity

2. **MQTT Connection Issues**
   - Verify MQTT broker settings
   - Check network connectivity
   - Review MQTT credentials

3. **Web Interface Not Loading**
   - Check if port 3000 is accessible
   - Verify container is running
   - Check container logs

### Logs

```bash
# View container logs
docker logs ialarm-mqtt

# Follow logs in real-time
docker logs -f ialarm-mqtt

# View specific log levels
docker logs ialarm-mqtt | grep ERROR
```

### Health Check

```bash
# Check system health
curl http://localhost:3000/api/health

# View Prometheus metrics
curl http://localhost:3000/api/metrics
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

### Development Guidelines

- Follow ESLint configuration
- Use conventional commits
- Add tests for new features
- Update documentation

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Original `node-ialarm` library maintainers
- Home Assistant community
- MQTT.js contributors
- All contributors and users

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/Stinocon/ialarm-mqtt/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Stinocon/ialarm-mqtt/discussions)
- **Documentation**: [Wiki](https://github.com/Stinocon/ialarm-mqtt/wiki)

---

**Made with ❤️ for the Home Assistant community**
