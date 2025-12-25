import React from "react";
import { ThreeDots } from "react-loader-spinner";
import { useVoiceAssistant } from "./hooks/useVoiceAssistant";
import "./App.css";

export default function App() {
  const {
    started,
    state,
    aiText,
    conversation,
    muted,
    transcript,
    listening,
    browserSupportsSpeechRecognition,
    startAssistant,
    stopAssistant,
    toggleMute,
  } = useVoiceAssistant();

  return (
    <div className="app-container">
      {/* Main Assistant Circle */}
      <div className="main-assistant-circle">
        <div className={`circle ${state}`}>
          {state === "idle" && "🎙️"}
          {state === "listening" && "👂"}
          {state === "thinking" && "🧠"}
          {state === "speaking" && "💬"}
        </div>

        {/* Active Listening Indicator */}
        {listening && (
          <div className="active-listening-indicator">
            <span className="blink-dot" />
            LISTENING
          </div>
        )}

        {/* Muted Indicator */}
        {muted && <div className="muted-indicator">🔇 TEXT ONLY</div>}
      </div>

      {/* State Text */}
      <div className="state-text">
        {state === "idle" && "Ready to chat"}
        {state === "listening" && (muted ? "Listening - Text Only Mode" : "I'm listening... (speak anytime)")}
        {state === "thinking" && (
          <div className="thinking-container">
            <ThreeDots height="20" width="40" color="white" />
            {muted ? "Processing (Text Only)..." : "Thinking..."}
          </div>
        )}
        {state === "speaking" && "Speaking... (interrupt by talking!)"}
      </div>

      {/* Control Buttons */}
      <div className="control-buttons">
        {!started ? (
          <button
            onClick={startAssistant}
            className="start-button"
            onMouseDown={(e) => (e.target.style.transform = "scale(0.95)")}
            onMouseUp={(e) => (e.target.style.transform = "scale(1)")}
          >
            🎙️ Start Voice Assistant
          </button>
        ) : (
          <button
            onClick={stopAssistant}
            className="stop-button"
            onMouseDown={(e) => (e.target.style.transform = "scale(0.95)")}
            onMouseUp={(e) => (e.target.style.transform = "scale(1)")}
          >
            ⏹️ Stop Assistant
          </button>
        )}
        <button
          onClick={toggleMute}
          disabled={!started}
          className={`mute-button ${!started ? "" : muted ? "muted" : "unmuted"}`}
          onMouseDown={(e) => started && (e.target.style.transform = "scale(0.95)")}
          onMouseUp={(e) => started && (e.target.style.transform = "scale(1)")}
        >
          {muted ? "🔇 Unmute" : "🔊 Mute"}
        </button>
      </div>

      {/* Conversation Display */}
      <div className="conversation-display">
        {conversation.length === 0 && (
          <div className="empty-conversation">
            Start speaking to begin the conversation...
          </div>
        )}

        {conversation.map((msg, index) =>
          msg.role === "user" ? (
            <div key={index} className="user-message">
              <div className="user-label">You</div>
              <div className="user-bubble">{msg.content}</div>
            </div>
          ) : (
            <div key={index} className="assistant-message">
              <div className="assistant-label">Assistant</div>
              <div className="assistant-bubble">{msg.content}</div>
            </div>
          )
        )}

        {transcript &&
          !conversation.some(
            (msg) => msg.role === "user" && msg.content === transcript
          ) && (
            <div className="transcript-user-message">
              <div className="user-label">You (listening...)</div>
              <div className="transcript-user-bubble">{transcript}</div>
            </div>
          )}
      </div>

      {/* Info Footer */}
      <div className="info-footer">
        <strong>💡 How it works:</strong><br />
        {muted
          ? "🔇 Text-only mode - Still listening, but won't speak. Unmute to enable voice."
          : "🔊 Voice mode - Interrupt anytime by speaking! Mute for text-only mode."}
      </div>
    </div>
  );
}
