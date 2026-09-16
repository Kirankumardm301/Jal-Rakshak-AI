# Jal Rakshak ESP32 sensor setup

This project includes `JalRakshak_ESP32.ino` for the following hardware:

- ESP32 Wi-Fi module
- YF-S201 water-flow sensor
- E-201-C pH sensor
- TS-300B turbidity sensor
- TDS Meter V1.0
- RCWL-1655 ultrasonic sensor
- 16x2 LCD with I2C interface

## Pin map

| Module | ESP32 pin | Signal |
| --- | ---: | --- |
| YF-S201 | GPIO 27 | Pulse output |
| E-201-C | GPIO 34 | Analog pH output |
| TDS Meter V1.0 | GPIO 35 | Analog TDS output |
| TS-300B | GPIO 32 | Analog turbidity output |
| RCWL-1655 | GPIO 5 | Trigger |
| RCWL-1655 | GPIO 18 | Echo |
| LCD SDA | GPIO 21 | I2C data |
| LCD SCL | GPIO 22 | I2C clock |

Connect all grounds together. Power each sensor from the voltage specified by its board. ESP32 ADC pins must never receive more than 3.3 V. If an analog board or the ultrasonic echo signal can output 5 V, add a voltage divider or a suitable level shifter before connecting it to the ESP32.

## LCD setup

Install the Arduino library `LiquidCrystal_I2C`. The sketch uses address `0x27`, which is the most common address for a 16x2 I2C backpack. If the backlight turns on but no text appears, run an I2C scanner and change `LCD_ADDRESS` in the sketch to `0x3F` if that is the detected address.

The LCD alternates every five seconds between:

```text
Tank: 69%
pH: 7.2 TDS:285
```

and:

```text
Flow: 58.0 L/min
WiFi: Online
```

The ESP32 I2C pins are 3.3V pins. If the LCD backpack is powered from 5V and its pull-up resistors raise SDA/SCL to 5V, use a bidirectional I2C level shifter. Do not connect a 5V I2C signal directly to GPIO 21 or GPIO 22.

The YF-S201 is normally powered from 5 V. Its pulse output should be checked with a multimeter or oscilloscope before connecting it directly to an ESP32 input. Use a 3.3 V pull-up or level shifter if the output rises above 3.3 V.

## Arduino IDE

1. Install the ESP32 board package.
2. Install the `LiquidCrystal_I2C` library.
3. Open `JalRakshak_ESP32.ino`.
4. Fill in your Wi-Fi values at the top of the file.
5. Set `TANK_DEPTH_CM` to the distance from the ultrasonic sensor to the empty-tank level.
6. Upload at 115200 baud.

The pH, TDS, turbidity, and flow values require calibration. The constants near the top of the sketch are starting points, not laboratory calibration values.

## Direct Wi-Fi telemetry (no MQTT)

The ESP32 now runs a small HTTP server. After uploading, open Serial Monitor at `115200` and copy the printed IP address. For example:

```text
ESP32 API: http://192.168.1.42
```

Open this endpoint in a browser on the same Wi-Fi network:

```text
http://192.168.1.42/api/telemetry
```

The response is JSON:

```json
{
  "deviceId": "JR-2024-001",
  "tankLevel": 69.0,
  "ph": 7.20,
  "tds": 285.0,
  "turbidityVoltage": 2.100,
  "flow": 58.00,
  "totalLitres": 2218.00,
  "wifi": true,
  "timestamp": 123456
}
```

The browser and ESP32 must be connected to the same Wi-Fi network. The React dashboard can call this endpoint directly using the IP address printed by the ESP32. The ESP32 IP may change after reboot; reserve a fixed IP in your router later for a permanent connection.

Storage and analysis:

- The ESP32 stores `totalLitres` in non-volatile Preferences storage, so the flow total survives reboot.
- The browser stores up to 500 recent telemetry responses in local storage under `jal-rakshak-telemetry-history`.
- The dashboard uses rule-based checks for pH, TDS, tank level, and flow abnormalities.
- Possible water theft is inferred when flow remains above 100 L/min for three consecutive readings. This is a consumption anomaly rule, not physical access detection.
- Possible pipeline leakage is inferred when flow remains above 0 and at or below 10 L/min for three consecutive readings, indicating continuous small flow.
- Flow monitoring thresholds are configurable in the Settings page and saved in browser storage: normal flow range, leakage range and duration, restricted hours, and unauthorized-flow limit and duration.
