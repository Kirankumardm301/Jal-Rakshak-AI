#include <WiFi.h>
#include <WebServer.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Preferences.h>

// Fill these values before uploading.
const char* WIFI_SSID = "Kiran";
const char* WIFI_PASSWORD = "00002222";
const char* DEVICE_ID = "JR-2024-001";

// ESP32 ADC1 pins are used so Wi-Fi does not interfere with analog reads.
const uint8_t FLOW_PIN = 27;       // YF-S201 pulse output
const uint8_t PH_PIN = 34;         // E-201-C analog output
const uint8_t TDS_PIN = 35;        // TDS Meter V1.0 analog output
const uint8_t TURBIDITY_PIN = 32;  // TS-300B analog output
const uint8_t TRIG_PIN = 5;        // RCWL-1655 trigger
const uint8_t ECHO_PIN = 18;       // RCWL-1655 echo, 3.3V-safe only
const uint8_t LCD_SDA_PIN = 21;
const uint8_t LCD_SCL_PIN = 22;
const uint8_t LCD_ADDRESS = 0x27;   // Try 0x3F if your LCD stays blank

// Tune these for the physical tank and calibrated sensor probes.
const float TANK_DEPTH_CM = 100.0;
const float FLOW_CALIBRATION = 7.5; // YF-S201 nominal pulses per L/min
const float PH_MIDPOINT_VOLTAGE = 2.50;
const float PH_SLOPE = 3.00;
const float TDS_TEMPERATURE_C = 25.0;

WebServer server(80);
LiquidCrystal_I2C lcd(LCD_ADDRESS, 16, 2);
Preferences preferences;
volatile uint32_t flowPulses = 0;
unsigned long lastRead = 0;
unsigned long lastDisplay = 0;
uint8_t displayPage = 0;
float tankLevel = 0;
float ph = 0;
float tds = 0;
float turbidityVoltage = 0;
float flowLitresPerMinute = 0;
float totalLitres = 0;

void IRAM_ATTR countFlowPulse() { flowPulses++; }

float readVoltage(uint8_t pin) {
  return analogRead(pin) * 3.3 / 4095.0;
}

float readDistanceCm() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(3);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  unsigned long duration = pulseIn(ECHO_PIN, HIGH, 30000);
  return duration == 0 ? TANK_DEPTH_CM : duration * 0.0343 / 2.0;
}

float readTankLevel() {
  float distance = constrain(readDistanceCm(), 0.0f, TANK_DEPTH_CM);
  return 100.0f * (TANK_DEPTH_CM - distance) / TANK_DEPTH_CM;
}

float readPh() {
  float voltage = readVoltage(PH_PIN);
  return constrain(7.0 + (PH_MIDPOINT_VOLTAGE - voltage) * PH_SLOPE, 0.0f, 14.0f);
}

float readTds() {
  float voltage = readVoltage(TDS_PIN);
  float compensation = 1.0 + 0.02 * (TDS_TEMPERATURE_C - 25.0);
  float ec = (133.42 * voltage * voltage * voltage - 255.86 * voltage * voltage + 857.39 * voltage) / compensation;
  return max(0.0f, ec * 0.5f);
}

float readTurbidityVoltage() { return readVoltage(TURBIDITY_PIN); }

void printLcdLine(uint8_t row, String text) {
  lcd.setCursor(0, row);
  lcd.print("                ");
  lcd.setCursor(0, row);
  lcd.print(text.substring(0, 16));
}

void updateDisplay() {
  if (displayPage == 0) {
    printLcdLine(0, String("Tank: ") + String(tankLevel, 0) + "%");
    printLcdLine(1, String("pH: ") + String(ph, 1) + " TDS:" + String(tds, 0));
  } else {
    printLcdLine(0, String("Flow: ") + String(flowLitresPerMinute, 1) + " L/min");
    printLcdLine(1, WiFi.status() == WL_CONNECTED ? "WiFi: Online" : "WiFi: Offline");
  }
  displayPage = (displayPage + 1) % 2;
}

void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) delay(500);
}

String telemetryJson() {
  return String("{\"deviceId\":\"") + DEVICE_ID +
    String("\",\"tankLevel\":") + String(tankLevel, 1) +
    String(",\"ph\":") + String(ph, 2) +
    String(",\"tds\":") + String(tds, 1) +
    String(",\"turbidityVoltage\":") + String(turbidityVoltage, 3) +
    String(",\"flow\":") + String(flowLitresPerMinute, 2) +
    String(",\"totalLitres\":") + String(totalLitres, 2) +
    String(",\"wifi\":true,\"timestamp\":") + String(millis()) + "}";
}

void readSensors() {
  tankLevel = readTankLevel();
  ph = readPh();
  tds = readTds();
  turbidityVoltage = readTurbidityVoltage();
  flowLitresPerMinute = (flowPulses * 60.0 / FLOW_CALIBRATION) / 10.0;
  totalLitres += flowPulses / FLOW_CALIBRATION;
  preferences.putFloat("totalLitres", totalLitres);
  flowPulses = 0;
}

void handleTelemetry() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "application/json", telemetryJson());
}

void handleRoot() {
  server.send(200, "text/plain", "Jal Rakshak ESP32 is online. Open /api/telemetry for sensor data.");
}

void setup() {
  Serial.begin(115200);
  pinMode(FLOW_PIN, INPUT_PULLUP);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  analogReadResolution(12);
  Wire.begin(LCD_SDA_PIN, LCD_SCL_PIN);
  lcd.init();
  lcd.backlight();
  preferences.begin("jal-rakshak", false);
  totalLitres = preferences.getFloat("totalLitres", 0.0f);
  printLcdLine(0, "Jal Rakshak AI");
  printLcdLine(1, "Starting...");
  attachInterrupt(digitalPinToInterrupt(FLOW_PIN), countFlowPulse, RISING);
  connectWifi();
  readSensors();
  server.on("/", HTTP_GET, handleRoot);
  server.on("/api/telemetry", HTTP_GET, handleTelemetry);
  server.begin();
  Serial.print("ESP32 API: http://");
  Serial.println(WiFi.localIP());
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) connectWifi();
  server.handleClient();
  if (millis() - lastDisplay >= 5000) {
    lastDisplay = millis();
    updateDisplay();
  }
  if (millis() - lastRead >= 10000) {
    lastRead = millis();
    readSensors();
  }
}
