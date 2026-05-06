import { useState, useEffect } from "react";
import "./App.css";

function App() {
  const [message, setMessage] = useState<string>("Loading...");

  useEffect(() => {
    fetch("/api/hello")
      .then((res) => res.json())
      .then((data: { message: string }) => setMessage(data.message))
      .catch(() => setMessage("Failed to connect to API"));
  }, []);

  return (
    <div className="app">
      <h1>Fling App</h1>
      <p className="api-message">{message}</p>
      <p className="hint">
        Edit <code>src/react-app/App.tsx</code> for the frontend
        <br />
        Edit <code>src/worker/index.ts</code> for the API
      </p>
      <a
        href="https://flingit.io"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-4 left-4 flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-gray-200 rounded-full shadow-sm text-xs text-gray-500 hover:text-gray-700 hover:border-gray-300 transition-colors"
      >
        <img src="/fling.svg" alt="Fling" className="w-4 h-4" />
        Made with Fling
      </a>
    </div>
  );
}

export default App;
