# Real-Time Mask Detection with Web UI and MQTT

This project is a web-based computer vision application for real-time mask detection. It uses a pretrained YOLOv11 model to perform inference, visualizes the results on a web interface, and integrates an MQTT service to publish detection data for consumption by other clients or IoT applications.

The core of this repository is a Node.js server that acts as a bridge between a web frontend and an MQTT broker. It subscribes to a topic to receive data from a separate computer vision script and serves a web UI to display this data. The UI can also be used to publish messages back to another MQTT topic.

## Architecture Overview

The system is composed of three main parts:

1.  **Computer Vision Script (External):** A separate process (e.g., a Python/Flask application) runs the YOLOv11 model on a video stream, performs mask detection, and publishes the results to an MQTT topic.
2.  **Node.js Backend Server (This Repo):** An Express.js server that subscribes to the MQTT topic to receive detection data, serves the frontend files, and provides API endpoints for the frontend to interact with. It can also publish data back to the MQTT broker.
3.  **Web Frontend:** A responsive, Bootstrap-based UI that displays the real-time data received from the server and allows users to send commands or data back via MQTT.

```
[CV Script (Tensorflow JS)] --- (Publishes detection data) ---> [MQTT Broker]
                                                                    ^
                                                                    | (Subscribes for detection data)
                                                                    | (Publishes prediction results)
                                                                    v
[Node.js/Express Server] <--- (HTTP GET/POST) --- [Web Browser (Frontend)]
```

## Technologies Used

*   **Backend:**
    *   [Node.js](https://nodejs.org/)
    *   [Express.js](https://expressjs.com/)
    *   [MQTT.js](https://github.com/mqttjs/MQTT.js) for MQTT communication
    *   [dotenv](https://github.com/motdotla/dotenv) for environment variable management
    *   [cors](https://github.com/expressjs/cors) & [body-parser](https://github.com/expressjs/body-parser) for handling requests
    *   [nodemon](https://nodemon.io/) for development
*   **Frontend:**
    *   HTML, CSS, JavaScript
    *   [Bootstrap](https://getbootstrap.com/) (or other framework in `public/`)
*   **Communication Protocol:**
    *   MQTT
*   **Computer Vision (External Component):**
    *   Tensorflow JS
    *   YOLOv11 Pretrained Model

## Installation

1.  **Clone the repository:**
    ```sh
    git clone <your-repository-url>
    cd cv-mqtt
    ```

2.  **Install Node.js dependencies:**
    ```sh
    npm install
    ```

3.  **Create a `.env` file:**
    Create a file named `.env` in the root of the project and populate it with the necessary environment variables. You can copy the example file:
    ```sh
    cp .env.example .env
    ```

    **`.env.example`:**
    ```env
    # Server Configuration
    PORT=3000
    APP_URL=http://localhost:

    # MQTT Topics
    # Topic for the server to subscribe to (e.g., from the Python CV script)
    MQTT_TOPIC_SUBS=cv/mask-detection/data

    # Topic for the server to publish to (e.g., from the web UI)
    MQTT_TOPIC_PUBLISH=cv/mask-detection/prediction
    ```

## How to Run

### 1. Backend Server

To run the server in development mode with automatic restarts on file changes (requires `nodemon`):

```sh
npm run dev
```

*Note: Add `"dev": "nodemon server.js"` to the `scripts` section of your `package.json`.*

To run in production:

```sh
npm start
```

*Note: Add `"start": "node server.js"` to the `scripts` section of your `package.json`.*

The server will start on the port defined in your `.env` file (e.g., `http://localhost:3000`).

### 2. Frontend

Once the backend server is running, open your web browser and navigate to `http://localhost:3000`.

### 3. Computer Vision Script

You need to run your separate computer vision script that publishes detection data to the MQTT topic specified as `MQTT_TOPIC_SUBS` in your `.env` file.

## MQTT Configuration

*   **Broker:** The application is currently hardcoded to connect to `mqtt://test.mosquitto.org`. You can change this in `server.js` or move it to the `.env` file for better configuration.
*   **Subscription Topic (`MQTT_TOPIC_SUBS`):** The server listens for messages on this topic. Your CV script should publish data here.
*   **Publish Topic (`MQTT_TOPIC_PUBLISH`):** The server publishes data to this topic when the `/prediction` endpoint is called from the frontend.

## API Endpoints

The server exposes two main endpoints for the frontend:

*   `GET /get-data`
    *   Retrieves the last message received from the `MQTT_TOPIC_SUBS` topic.
    *   **Example Response:**
        ```json
        {
          "data": "{\"status\": \"Mask Detected\", \"confidence\": 0.95}"
        }
        ```

*   `POST /prediction`
    *   Publishes the raw text body of the request to the `MQTT_TOPIC_PUBLISH` topic.
    *   **Example Usage (cURL):**
        ```sh
        curl -X POST -H "Content-Type: text/plain" --data "manual_override_no_mask" http://localhost:3000/prediction
        ```
    *   **Example Success Response:**
        ```json
        {
          "message": "Message published successfully",
          "payload": "manual_override_no_mask"
        }
        ```

## Folder Structure

```
cv-mqtt/
├── public/
│   ├── index.html      # Frontend HTML
│   ├── css/            # Stylesheets
│   └── js/             # Client-side scripts
├── node_modules/       # Installed dependencies
├── .env                # Environment variables (local)
├── .env.example        # Example environment variables
├── .gitignore          # Git ignore file
├── package.json        # Project metadata and dependencies
├── package-lock.json   # Exact dependency versions
└── server.js           # Main Express.js and MQTT server logic
```

## Contributing

Contributions are welcome! Please feel free to submit a pull request or open an issue for any bugs or feature requests.

1.  Fork the repository.
2.  Create your feature branch (`git checkout -b feature/AmazingFeature`).
3.  Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4.  Push to the branch (`git push origin feature/AmazingFeature`).
5.  Open a Pull Request.

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.

---

*This README was generated with the assistance of Gemini Code Assist.*