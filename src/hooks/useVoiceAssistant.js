import { useEffect, useRef, useState, useCallback } from "react";

export function useVoiceAssistant() {
  // -------------------- REFS --------------------
  const silenceTimer = useRef(null);
  const recognitionRef = useRef(null);

  const isRecognitionRunningRef = useRef(false);
  const isProcessingRef = useRef(false);
  const isSpeakingRef = useRef(false);

  const lastTranscriptRef = useRef("");
  const sentenceQueueRef = useRef([]);
  const sentenceIndexRef = useRef(0);
  const apiResponsesRef = useRef([]);

  // -------------------- STATE --------------------
  const [started, setStarted] = useState(false);
  const [state, setState] = useState("idle");
  const [conversation, setConversation] = useState([]);
  const [muted, setMuted] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);

  const isIOS =
  typeof window !== "undefined" &&
  /iPad|iPhone|iPod/.test(navigator.userAgent) &&
  !window.MSStream;

  // -------------------- SUPPORT CHECK --------------------
  const browserSupportsSpeechRecognition =
    typeof window !== "undefined" &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);

  // -------------------- SAFE MIC CONTROL --------------------
  const safeStartRecognition = () => {
    if (!recognitionRef.current) return;
    if (isRecognitionRunningRef.current) return;

    try {
      recognitionRef.current.start();
    } catch (e) {
      console.warn("⚠️ start ignored:", e.message);
    }
  };

  const safeStopRecognition = () => {
    if (!recognitionRef.current) return;
    if (!isRecognitionRunningRef.current) return;

    recognitionRef.current.stop();
  };

  // -------------------- INIT SPEECH RECOGNITION --------------------
  const initSpeechRecognition = useCallback(() => {
    if (!browserSupportsSpeechRecognition) return;

    const SpeechRecognitionAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      isRecognitionRunningRef.current = true;
      setListening(true);
      console.log("🎤 Mic started");
    };

    recognition.onend = () => {
      isRecognitionRunningRef.current = false;
      setListening(false);
      console.log("🎤 Mic stopped");
    };

    recognition.onerror = (e) => {
      isRecognitionRunningRef.current = false;
      setListening(false);
      console.error("🎤 Mic error:", e.error);
    };

    recognition.onresult = (event) => {
      let finalText = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalText += event.results[i][0].transcript;
        }
      }

      if (finalText) {
        setTranscript((prev) => prev + finalText);
      }
    };

    recognitionRef.current = recognition;
  }, [browserSupportsSpeechRecognition]);

  // -------------------- INIT ON MOUNT --------------------
  useEffect(() => {
    initSpeechRecognition();
  }, [initSpeechRecognition]);

  // -------------------- LOAD STATIC RESPONSES --------------------
  useEffect(() => {
    fetch("https://metaverse.thecivit.com/mk/response")
      .then((r) => r.json())
      .then((d) => {
        apiResponsesRef.current = d.response || d;
      })
      .catch(console.error);
  }, []);

  // -------------------- SILENCE + INTERRUPTION LOGIC --------------------
  useEffect(() => {
    if (isIOS) return; // iOS does NOT support live interruption

    if (!started || !transcript) return;

    clearTimeout(silenceTimer.current);

    silenceTimer.current = setTimeout(() => {
      if (
        transcript &&
        transcript !== lastTranscriptRef.current &&
        !isProcessingRef.current
      ) {
        lastTranscriptRef.current = transcript;
        isProcessingRef.current = true;
        askAI(transcript);
        setTranscript("");
      }
    }, 1500);
  }, [transcript, started]);

  // -------------------- KEEP MIC ALIVE --------------------
  useEffect(() => {
    if (started && !isProcessingRef.current) {
      safeStartRecognition();
    }
  }, [started, state]);

  // -------------------- START / STOP --------------------
  const startAssistant = () => {
    setStarted(true);
    setState("listening");
    lastTranscriptRef.current = "";
    isProcessingRef.current = false;
    setTranscript("");
    safeStartRecognition();
  };

  const stopAssistant = () => {
    setStarted(false);
    setState("idle");
    speechSynthesis.cancel();
    isSpeakingRef.current = false;
    isProcessingRef.current = false;
    clearTimeout(silenceTimer.current);
    safeStopRecognition();
  };

  // -------------------- MUTE --------------------
  const toggleMute = () => {
    setMuted((m) => {
      if (!m) {
        speechSynthesis.cancel();
        isSpeakingRef.current = false;
        setState("listening");
        safeStartRecognition();
      }
      return !m;
    });
  };

  // -------------------- MATCH RESPONSE --------------------
  const findBestMatch = (input, responses) => {
    const text = input.toLowerCase();
    return responses.find((r) => text.includes(r.message.toLowerCase())) || responses[0];
  };

  // -------------------- ASK AI --------------------
  const askAI = async (text) => {
    setState("thinking");
    safeStopRecognition();

    const responses = apiResponsesRef.current || [];
    const match = findBestMatch(text, responses);

    const reply =
      match?.text || "I'm sorry, could you please repeat that?";

    setConversation((c) => [
      ...c,
      { role: "user", content: text },
      { role: "assistant", content: reply },
    ]);

    if (!muted) {
      speak(reply);
    } else {
      setState("listening");
      isProcessingRef.current = false;
      safeStartRecognition();
    }
  };

  // -------------------- SPEAK --------------------
  const speak = async (text) => {
    if (muted) return;
  
    // iOS SAFARI FIX: single utterance only
    if (isIOS) {
      speechSynthesis.cancel();
  
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 0.95;
      utter.pitch = 1;
      utter.volume = 1;
  
      isSpeakingRef.current = true;
      setState("speaking");
  
      utter.onend = () => {
        isSpeakingRef.current = false;
        setState("listening");
        isProcessingRef.current = false;
  
        // resume mic AFTER speech ends
        setTimeout(() => {
          safeStartRecognition();
        }, 300);
      };
  
      utter.onerror = () => {
        isSpeakingRef.current = false;
        setState("listening");
        isProcessingRef.current = false;
        safeStartRecognition();
      };
  
      speechSynthesis.speak(utter);
      return;
    }
  
    // ---------------- DESKTOP BEHAVIOR ----------------
    // sentence-by-sentence is SAFE on Chrome/Edge
    sentenceQueueRef.current = text.split(/(?<=[.!?])\s+/);
    sentenceIndexRef.current = 0;
    speakNextSentence();
  };
  
  const speakNextSentence = () => {
    if (muted) return;

    const sentences = sentenceQueueRef.current;
    const index = sentenceIndexRef.current;

    if (index >= sentences.length) {
      isSpeakingRef.current = false;
      setState("listening");
      isProcessingRef.current = false;
      safeStartRecognition();
      return;
    }

    const utter = new SpeechSynthesisUtterance(sentences[index]);
    isSpeakingRef.current = true;
    setState("speaking");

    utter.onend = () => {
      sentenceIndexRef.current++;
      speakNextSentence();
    };

    utter.onerror = () => {
      isSpeakingRef.current = false;
      isProcessingRef.current = false;
      setState("listening");
      safeStartRecognition();
    };

    speechSynthesis.speak(utter);
  };

  // -------------------- EXPORT --------------------
  return {
    started,
    state,
    conversation,
    muted,
    transcript,
    listening,
    browserSupportsSpeechRecognition,
    startAssistant,
    stopAssistant,
    toggleMute,
  };
}
