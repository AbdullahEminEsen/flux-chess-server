# Flux Chess Game
[![Ask DeepWiki](https://devin.ai/assets/askdeepwiki.png)](https://deepwiki.com/AbdullahEminEsen/flux-chess-server)

This repository contains the backend and frontend for **Flux Chess**, a real-time, two-player online chess variant. It features custom pieces with unique abilities, HP and attack stats, and a skill-based combat system where timing determines the damage dealt. The entire game logic is authoritatively handled by the Node.js server, with a lightweight vanilla JavaScript client for rendering and interaction.

## Key Features

- **Real-time Multiplayer:** Uses Socket.IO for low-latency, WebSocket-based communication between clients and the server.
- **Server-Authoritative Logic:** All game rules, move validation, and combat resolution are handled securely on the server to prevent cheating.
- **Room-Based Matchmaking:** Players can create a private game room and share a unique Room ID and 4-digit PIN with an opponent to join.
- **Custom Pieces & Mechanics:** A fresh take on chess with pieces like the Vizier, Oracle, Rider, and Tower, each with special movement and upgrade paths.
- **HP & Combat System:** Pieces have health points (HP) and attack power (ATK). Instead of instant captures, moving onto an enemy piece initiates a timed attack mini-game.
- **Timing-Based Damage:** The attacking player is presented with an oscillating bar. Pressing the spacebar closer to the center results in higher damage.
- **Piece Upgrades:** Certain pieces can unlock enhanced abilities during the game, such as the Oracle gaining unlimited diagonal movement or the Tower gaining unlimited orthogonal movement.
- **Single-File Client:** The entire client-side application is contained within a single `chess.html` file, using the HTML5 Canvas for board rendering.

## How to Play

The game client is designed to be simple to use.

1.  Open two browser tabs/windows pointing to the `chess.html` file (or the live deployment URL).
2.  **In the first tab:** Click the **"Oda Oluştur"** (Create Room) button. A unique **Room ID** and **PIN** will be generated and displayed. You will be assigned the White pieces.
3.  **In the second tab:** Enter the **Room ID** and **PIN** from the first tab into the corresponding input fields. Click the **"Katıl"** (Join) button. You will be assigned the Black pieces.
4.  The game will start immediately. White moves first.

Each player always sees their own pieces at the bottom of the board for a consistent perspective.

## Game Rules & Pieces

The objective is to capture the opponent's **Crown (K)**.

When a piece moves onto a square occupied by an opponent, combat is initiated. The attacker performs a timing mini-game to determine the damage dealt, which is calculated on the server based on the time the attack was committed.

### Piece Reference

| Piece | Name | Type | HP | ATK | Abilities |
| :---: | :--- | :--- | :-: | :-: | :--- |
| ♔ | **Crown** | `K` | 8 | 2 | Moves 1 square in any direction. Losing this piece means losing the game. |
| ♖ | **Tower** | `T` | 6 | 4 | Moves up to 3 squares orthogonally. Captures like a cannon: it jumps over the first piece in its path to capture the second. Completing a square-shaped move path (e.g., A1→A4→D4→D1→A1) grants it unlimited orthogonal movement. |
| ✧ | **Vizier** | `V` | 5 | 3 | Moves up to 2 squares in any direction (a Queen with 2-range). |
| ◎ | **Oracle** | `O` | 5 | 3 | Moves up to 2 squares diagonally. After making 3 consecutive moves with any Oracle, the specific piece used for the third move gains unlimited diagonal range. |
| ♘ | **Rider** | `R` | 5 | 3 | Moves in an 'L' shape like a Knight, but can also make extended 3x1 and 1x3 leaps. |
| ◬ | **Scout** | `S` | 3 | 2 | Moves one square diagonally forward. Captures by moving one square directly forward. Promotes to a Rider upon reaching the opponent's back rank. |

## Technical Overview

### Backend (`server.js`)

- **Stack:** Node.js, Express, Socket.IO
- **Responsibilities:**
    - Serves as the WebSocket endpoint for game clients.
    - Manages game rooms, including creation, joining, and player state.
    - Holds the authoritative game state for every active match.
    - Validates all incoming moves against the game rules.
    - Resolves combat, calculating damage based on server-side timers to ensure fairness.
    - Broadcasts updated game states to all clients in a room.

### Frontend (`chess.html`)

- **Stack:** HTML, CSS, Vanilla JavaScript
- **Responsibilities:**
    - Connects to the backend WebSocket server.
    - Provides a UI for creating and joining game rooms.
    - Renders the board, pieces, and valid moves on an HTML5 `<canvas>`.
    - Captures player input (mouse clicks) and sends move commands to the server.
    - Displays the attack-timing mini-game interface.
    - Updates the visual representation of the game based on state messages received from the server.

## Running Locally

To run the server on your own machine:

1.  **Clone the repository:**
    ```sh
    git clone https://github.com/abdullaheminesen/flux-chess-server.git
    cd flux-chess-server
    ```

2.  **Install dependencies:** (Requires Node.js v20 or higher)
    ```sh
    npm install
    ```

3.  **Start the server:**
    ```sh
    npm start
    ```
    The server will be running on `http://localhost:3000`.

4.  **Connect the client:**
    - Open the `chess.html` file in your browser.
    - In `chess.html`, find the `SOCKET_URL` constant and change it to your local server's address:
      ```javascript
      // const SOCKET_URL = 'https://flux-chess-server.onrender.com';
      const SOCKET_URL = 'http://localhost:3000';
      ```
    - You can now open multiple tabs and follow the "How to Play" section to start a local game.
