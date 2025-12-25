import { useEffect, useRef, useState } from "react";
import SpeechRecognition, {
  useSpeechRecognition,
} from "react-speech-recognition";

export function useVoiceAssistant() {
  const silenceTimer = useRef(null);
  const isProcessingRef = useRef(false);
  const lastTranscriptRef = useRef("");
  const isSpeakingRef = useRef(false);
  const sentenceQueueRef = useRef([]);
  const sentenceIndexRef = useRef(0);
  const apiResponsesRef = useRef([]);

  const [started, setStarted] = useState(false);
  const [state, setState] = useState("idle");
  const [aiText, setAiText] = useState("");
  const [conversation, setConversation] = useState([]);
  const [muted, setMuted] = useState(false);

  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition,
  } = useSpeechRecognition();

  const loadVoices = () =>
    new Promise((resolve) => {
      const voices = speechSynthesis.getVoices();
      if (voices.length) resolve(voices);
      speechSynthesis.onvoiceschanged = () =>
        resolve(speechSynthesis.getVoices());
    });

  // Load API responses on mount
  useEffect(() => {
    const loadApiResponses = async () => {
      try {
        const response = await fetch("https://metaverse.thecivit.com/mk/response", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (response.ok) {
          const data = await response.json();
          apiResponsesRef.current = data.response || data;
          console.log("✅ Loaded API responses:", apiResponsesRef.current.length);
        }
      } catch (error) {
        console.error("Failed to load API responses:", error);
      }
    };

    loadApiResponses();
  }, []);

  // Enhanced matching algorithm with word-level matching
  const findBestMatch = (userInput, responses) => {
    const normalizedInput = userInput.toLowerCase().trim();
    const inputWords = normalizedInput.split(/\s+/).filter(w => w.length > 0);

    // 1. Try exact match first
    let match = responses.find(item =>
      item.message.toLowerCase().trim() === normalizedInput
    );
    if (match) return match;

    // 2. Try exact phrase match (case insensitive)
    match = responses.find(item =>
      normalizedInput.includes(item.message.toLowerCase()) ||
      item.message.toLowerCase().includes(normalizedInput)
    );
    if (match) return match;

    // 3. Word-level matching - find response with most matching words
    let bestMatch = null;
    let maxMatchScore = 0;

    for (const item of responses) {
      const messageWords = item.message.toLowerCase().split(/\s+/).filter(w => w.length > 0);

      // Count matching words
      let matchCount = 0;
      for (const msgWord of messageWords) {
        if (inputWords.some(inputWord =>
          inputWord.includes(msgWord) || msgWord.includes(inputWord)
        )) {
          matchCount++;
        }
      }

      // Calculate match score (percentage of message words that matched)
      const matchScore = messageWords.length > 0 ? matchCount / messageWords.length : 0;

      if (matchScore > maxMatchScore && matchCount > 0) {
        maxMatchScore = matchScore;
        bestMatch = item;
      }
    }

    // 4. If we found a good word match (at least 50% of words match), use it
    if (bestMatch && maxMatchScore >= 0.5) {
      return bestMatch;
    }

    // 5. Fallback to first response or default message
    return responses[0] || null;
  };

  // CRITICAL: Handle interruptions and silence detection
  useEffect(() => {
    if (!browserSupportsSpeechRecognition) {
      alert("Browser doesn't support speech recognition.");
      return;
    }

    if (transcript && started && transcript.length > 3) {
      // SCENARIO 1: User interrupts while bot is speaking
      if (isSpeakingRef.current && transcript !== lastTranscriptRef.current) {
        console.log("🚨 INTERRUPTION DETECTED:", transcript);

        // Stop speaking immediately
        speechSynthesis.cancel();
        isSpeakingRef.current = false;
        setState("listening");

        // Clear silence timer
        clearTimeout(silenceTimer.current);

        // Process the interruption after short delay
        silenceTimer.current = setTimeout(() => {
          if (transcript && !isProcessingRef.current) {
            console.log("📝 Processing interruption:", transcript);
            lastTranscriptRef.current = transcript;
            isProcessingRef.current = true;
            askAI(transcript);
            resetTranscript();
          }
        }, 1000);

        return;
      }

      // Normal silence detection when NOT being interrupted
      clearTimeout(silenceTimer.current);

      silenceTimer.current = setTimeout(() => {
        if (
          transcript &&
          transcript !== lastTranscriptRef.current &&
          !isProcessingRef.current
        ) {
          console.log("💬 Normal input detected:", transcript);
          lastTranscriptRef.current = transcript;
          isProcessingRef.current = true;
          askAI(transcript);
          resetTranscript();
        }
      }, 1500);
    }
  }, [transcript, started, browserSupportsSpeechRecognition]);

  // Keep microphone ALWAYS active when started
  useEffect(() => {
    if (started && !listening && !isProcessingRef.current) {
      console.log("🎤 Ensuring microphone is active");
      SpeechRecognition.startListening({
        continuous: true,
        language: "en-US",
      });
    }
  }, [started, listening, state]);

  const startAssistant = () => {
    setStarted(true);
    setState("listening");
    lastTranscriptRef.current = "";
    isProcessingRef.current = false;
    resetTranscript();
    SpeechRecognition.startListening({
      continuous: true,
      language: "en-US",
    });
  };

  const stopAssistant = () => {
    setStarted(false);
    setState("idle");
    speechSynthesis.cancel();
    isProcessingRef.current = false;
    isSpeakingRef.current = false;
    clearTimeout(silenceTimer.current);
    SpeechRecognition.stopListening();
  };

  // SCENARIO 2: Mute/Unmute handling
  const toggleMute = () => {
    setMuted((prev) => {
      const next = !prev;

      if (next) {
        // 🔇 MUTING: Stop speaking but KEEP LISTENING
        console.log("🔇 MUTED - Stopping speech, keeping mic active");

        if (isSpeakingRef.current) {
          speechSynthesis.cancel();
          isSpeakingRef.current = false;
          setState("listening");
        }

        // CRITICAL: Keep microphone active even when muted
        if (started && !listening) {
          console.log("🎤 Restarting mic in muted mode");
          SpeechRecognition.startListening({
            continuous: true,
            language: "en-US",
          });
        }
      } else {
        // 🔊 UNMUTED: Resume normal operation
        console.log("🔊 UNMUTED - Interruptions enabled again");
        // Interruption will work automatically via useEffect
      }

      return next;
    });
  };

  const askAI = async (text) => {
    setState("thinking");
    setAiText("");

    // Stop listening temporarily during API processing
    SpeechRecognition.stopListening();

    const newConversation = [...conversation, { role: "user", content: text }];

    try {
      // Use pre-loaded responses
      const responses = apiResponsesRef.current;

      if (!responses || responses.length === 0) {
        throw new Error("No API responses available");
      }

      // Use enhanced matching algorithm
      const matchedResponse = findBestMatch(text, responses);

      const fullResponse = matchedResponse
        ? matchedResponse.text
        : "I'm sorry, I didn't understand that. Could you please rephrase?";

      console.log("✅ Matched:", matchedResponse?.message, "→", fullResponse);

      // Update conversation
      setConversation([
        ...newConversation,
        { role: "assistant", content: fullResponse },
      ]);

      setAiText("");

      // Check mute status - speak only if NOT muted
      if (!muted) {
        speak(fullResponse);
      } else {
        // If muted, just show in chat and resume listening
        console.log("🔇 Muted - text only, resuming listening");
        setState("listening");

        // Resume listening immediately
        setTimeout(() => {
          if (started) {
            SpeechRecognition.startListening({
              continuous: true,
              language: "en-US",
            });
          }
        }, 100);
      }

      isProcessingRef.current = false;
    } catch (error) {
      console.error("API Error:", error);
      const errorMsg = "I couldn't process your request. Please try again.";

      setConversation([
        ...newConversation,
        { role: "assistant", content: errorMsg },
      ]);
      setAiText("");

      // Respect mute for errors too
      if (!muted) {
        speak(errorMsg);
      } else {
        setState("listening");
        setTimeout(() => {
          if (started) {
            SpeechRecognition.startListening({
              continuous: true,
              language: "en-US",
            });
          }
        }, 100);
      }

      isProcessingRef.current = false;
    }
  };

  const speak = async (text) => {
    // If muted, skip speaking entirely
    if (muted) {
      setState("listening");
      isSpeakingRef.current = false;

      // Resume listening
      if (started) {
        setTimeout(() => {
          SpeechRecognition.startListening({
            continuous: true,
            language: "en-US",
          });
        }, 100);
      }
      return;
    }

    // Prepare sentence queue
    const cleanText = text
      .replace(/[*_`#]/g, "")
      .replace(/\(.+?\)/g, "")
      .trim()
      .slice(0, 500);

    sentenceQueueRef.current = cleanText.split(/(?<=[.!?])\s+/);
    sentenceIndexRef.current = 0;

    speakNextSentence();
  };

  const speakNextSentence = async () => {
    // ALWAYS check mute status - stop if muted
    if (muted) {
      console.log("🔇 Muted detected - stopping speech");
      isSpeakingRef.current = false;
      setState("listening");

      // Keep listening even when muted
      if (started) {
        setTimeout(() => {
          SpeechRecognition.startListening({
            continuous: true,
            language: "en-US",
          });
        }, 100);
      }
      return;
    }

    const index = sentenceIndexRef.current;
    const sentences = sentenceQueueRef.current;

    // CRITICAL: Ensure mic is ON during speaking for interruption detection
    if (started && !listening) {
      console.log("🎤 Activating mic during speech for interruption detection");
      SpeechRecognition.startListening({
        continuous: true,
        language: "en-US",
      });
    }

    // All sentences complete
    if (index >= sentences.length) {
      isSpeakingRef.current = false;
      setState("listening");
      console.log("✅ Speech complete - mic should be active");

      // Ensure mic is restarted after speech
      setTimeout(() => {
        if (started && !listening) {
          console.log("🎤 Restarting mic after speech completion");
          SpeechRecognition.startListening({
            continuous: true,
            language: "en-US",
          });
        }
      }, 200);
      return;
    }

    const voices = await loadVoices();
    const voice = voices.find((v) => v.lang === "en-US") || voices[0];

    const utter = new SpeechSynthesisUtterance(sentences[index]);
    utter.voice = voice;
    utter.rate = 0.95;
    utter.pitch = 1.0;
    utter.volume = 1;

    isSpeakingRef.current = true;
    setState("speaking");
    console.log(`🗣️ Speaking sentence ${index + 1}/${sentences.length}`);

    utter.onend = () => {
      // Check mute before continuing to next sentence
      if (!muted) {
        sentenceIndexRef.current += 1;
        setTimeout(speakNextSentence, 120);
      } else {
        console.log("🔇 Muted during speech - stopping");
        isSpeakingRef.current = false;
        setState("listening");

        if (started) {
          setTimeout(() => {
            SpeechRecognition.startListening({
              continuous: true,
              language: "en-US",
            });
          }, 100);
        }
      }
    };

    utter.onerror = (e) => {
      console.error("⚠️ Speech error:", e);
      isSpeakingRef.current = false;
      setState("listening");

      // Restart mic on error
      if (started) {
        setTimeout(() => {
          SpeechRecognition.startListening({
            continuous: true,
            language: "en-US",
          });
        }, 100);
      }
    };

    speechSynthesis.speak(utter);
  };

  return {
    // State
    started,
    state,
    aiText,
    conversation,
    muted,
    transcript,
    listening,
    browserSupportsSpeechRecognition,

    // Functions
    startAssistant,
    stopAssistant,
    toggleMute,
  };
}
