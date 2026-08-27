# 😷 Real-Time Mask Detection with TF.js & MQTT 🚀

A slick web app that runs a YOLOv11 model right in your browser and broadcasts the detection results via MQTT! 📡

## ✨ Quick Overview

This project uses a clever architecture where ALL the heavy lifting happens on the client-side!

1.  **🧠 Frontend (Your Browser):** The web page loads a **TensorFlow.js** model, uses your webcam, performs real-time mask detection directly in the browser, and **publishes the results straight to the MQTT broker over WebSocket** — no backend needed!
2.  **🌉 Backend (Node.js Server, optional):** Only used for local development (`npm run dev`). It serves the frontend and exposes `/get-data` + `/prediction` endpoints for testing.

Here's the flow:

```
[🐍 CV Script] ---📢---> [📡 MQTT Broker] <---📢--- [💻 Your Browser (TF.js + MQTT over WebSocket)]
```

## 🗂️ Folder Structure

```
cv-mqtt/
├── 📂 public/              # All our frontend magic lives here
│   ├── 📄 index.html       # The main page
│   ├── 🎨 css/             # Stylesheets to make it pretty
│   └── 📜 js/              # Client-side JavaScript
├── 📦 node_modules/        # All the project dependencies
├── 🔑 .env                 # Your secret keys and config (Create this!)
├── 📝 .env.example         # An example .env file to get you started
├── 🚫 .gitignore           # Tells Git what to ignore
├── 📦 package.json         # Project info and dependencies
├── 🔒 package-lock.json    # Locks down dependency versions
└── 🚀 server.js            # Our main Node.js server file!
```

## ⚙️ Tech Stack

*   **🤖 Computer Vision (External Component):**
    *   Python 🐍
    *   YOLOv11
*   **📡 Backend (This Repo):**
    *   Node.js 🟢
    *   Express.js 🚂
    *   MQTT.js
*   **🎨 Frontend:**
    *   HTML / CSS / JS
    *   Bootstrap
*   **🛠️ Dev Tools:**
    *   `dotenv` for environment variables
    *   `nodemon` for auto-reloading

## 🚀 Get it Running!

Let's get the Node.js server up and running.

### 1. Clone & Install

First, grab the code and install the necessary packages.

```bash
# Clone the repository
git clone <your-repository-url>
cd cv-mqtt

# Install dependencies
npm install
```

### 2. Configure Your Environment

Copy the example environment file to create your own.

```bash
cp .env.example .env
```

Now, open `.env` and check the topics. The defaults are:
```env
APP_URL=http://localhost
PORT=3000
MQTT_TOPIC_PUBLISH=your/publish/topic
MQTT_TOPIC_SUBS=your/subscribe/topic
```

### 3. Fire it up! 🔥

For development (with auto-reload on file changes):

```bash
npm run dev
```

For production, you can add a `start` script to your `package.json` and run it:

```bash
# In package.json, add: "dev": "nodemon server.js"
npm start
```

Your server should now be live at `http://localhost:3000`! 🌍

## 🌍 Deploy to Vercel

The production app is 100% static — `vercel.json` simply serves the `public/` folder, no server required.

1. Push this repo to GitHub.
2. Go to [vercel.com/new](https://vercel.com/new) and import the repository.
3. Click **Deploy**. No environment variables needed.

Model weights (`.bin` shards) are cached with `immutable` headers, so repeat visits load the model almost instantly. If you ever replace the model, rename the `public/best_web_model/` folder so clients pick up the new weights.

## 🧩 MQTT Setup

This app is set up to connect to a public MQTT broker out-of-the-box. The browser talks to the broker directly over WebSocket:

*   **Broker (browser):** `wss://test.mosquitto.org:8081` — change this in `public/scripts/script.js`.
*   **Publishes to:** `input/gestur` — the `MQTT_TOPIC_PUBLISH` constant in `public/scripts/script.js`.
*   **Broker (local dev server):** `mqtt://test.mosquitto.org` (you can change this in `server.js`).

## 🔍 Sample Usage

The local dev server provides a couple of simple API endpoints (note: the deployed Vercel app no longer uses these — the browser publishes to MQTT directly).

*   **Get the latest data:**
    ```bash
    # Fetches the last message received from the CV script
    curl http://localhost:3000/get-data
    ```
    **Example Response:**
    ```json
    {
      "data": {
        "label" : "mask", 
        "score" : 0.999,
      }
    }
    ```

*   **Send a prediction/command:**
    ```bash
    # Publishes a message to the MQTT publish topic
    curl -X POST -H "Content-Type: text/plain" --data "manual_override" http://localhost:3000/prediction
    ```
    **Example Response:**
    ```json
    {
      "message": "Message published successfully",
      "payload": {
        "label" : "mask", 
        "score" : 0.999,
      }
    }
    ```

## 👥 Contributing

Want to help make this project even more awesome? Contributions are welcome!

1.  **Fork** the repository.
2.  Create your feature branch (`git checkout -b feature/AmazingFeature`).
3.  **Commit** your changes (`git commit -m 'Add some AmazingFeature'`).
4.  **Push** to the branch (`git push origin feature/AmazingFeature`).
5.  Open a **Pull Request**.

Let's build something cool together! 🎉

## 📄 License

This project is licensed under the **ISC License**. See the `package.json` for more details.