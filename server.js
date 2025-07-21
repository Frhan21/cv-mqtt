require("dotenv").config();

const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const cors = require("cors");
const mqtt = require("mqtt");

const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// Start MQTT
let data;

const mqttClient = mqtt.connect("mqtt://test.mosquitto.org");
mqttClient.on("connect", () => {
  console.log("Connected to MQTT broker");

  // Kalau ada data yang di subscribe
  const topic = process.env.MQTT_TOPIC_SUBS;
  mqttClient.subscribe(topic, (err) => {
    if (err) {
      console.log("Failed to subscribe to topic", err);
    } else {
      console.log("Subscribed to topic", topic);
    }
  });
});

mqttClient.on("message", (topic, message) => {
  data = message.toString();
  console.log(`Received data from MQTT: ${data}`);
});

// GET DATA FROM MQTT_TOPIC_SUBS
app.get("/get-data", (req, res) => {
  res.json({ data });
});

// POST DATA HASIL PREDIKSI
app.use("/prediction", express.text());
app.post("/prediction", (req, res) => {
  const payload = req.body;
  const topic = process.env.MQTT_TOPIC_PUBLISH;

  if (!payload) {
    return res.status(400).json({ error: "Payload is required" });
  }
  mqttClient.publish(topic, payload, (err) => {
    if (err) {
      console.log("Failed to publish message", err);
    } else {
      console.log("Message published successfully", payload);
      res.json({
        message: "Message published successfully",
        payload,
      });
    }
  });
});

const port = process.env.PORT || 3000;
const url = process.env.APP_URL

app.listen(port, () => {
  console.log(`Server is running on ${url}${port}`);
});
