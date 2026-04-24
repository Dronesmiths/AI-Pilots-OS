/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable @next/next/no-img-element */
'use client';

import { useState, useEffect, useRef } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import styles from './page.module.css';
import Vapi from '@vapi-ai/web';
import { Play, Square, Loader2 } from 'lucide-react';

import { femaleVoices, maleVoices, allVoices } from '@/voices-array';

export default function OnboardingWizard() {
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 6; // INCREASED TO 6!

  // --- VAPI WEB AUDIO PREVIEW LOGIC ---
  const [vapiClient, setVapiClient] = useState<any>(null);
  const [testingVoiceId, setTestingVoiceId] = useState<string | null>(null);
  const callTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Client-side execution isolation
    const vapi = new Vapi('74c72495-b876-477b-84cd-3bcff1c23c0d');
    setVapiClient(vapi);
    
    vapi.on('call-end', () => {
      setTestingVoiceId(null);
      if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
    });

    return () => {
      vapi.stop();
      vapi.removeAllListeners();
    };
  }, []);

  const handlePreviewVoice = (voiceId: string, voiceLabel: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Restrains selecting the box while just aggressively trying to play audio
    
    if (!vapiClient) return;

    if (testingVoiceId === voiceId) {
      vapiClient.stop();
      setTestingVoiceId(null);
      return;
    }

    vapiClient.stop();
    setTestingVoiceId(voiceId + '-loading');

    const matchedVoice = allVoices.find(v => v.id === voiceId) || allVoices[0];
    const shortName = voiceLabel.split(' ')[0];

    vapiClient.start("76d5995a-d925-47d8-b6e9-e7e9d1dfc721", {
      name: shortName,
      firstMessage: `Hello, I'm ${shortName}. It's so great to meet you! How are you doing today?`,
      model: {
        provider: "custom-llm",
        url: window.location.origin.includes('localhost') 
             ? "https://your-ngrok-tunnel.ngrok.app/api/nova/brain" // Local development override
             : `${window.location.origin}/api/nova/brain`,
        messages: [{
          role: "system",
          content: `You are ${shortName}. A human is test-driving your voice natively right now for their business. Introduce yourself excitedly, let them confidently speak back to you, and casually have an extremely brief, incredibly friendly 20-second conversation. You MUST politely naturally say goodbye and end the call dynamically after literally 2 or 3 short conversational interactions.`
        }]
      },
      voice: {
        provider: matchedVoice.provider,
        voiceId: matchedVoice.voiceId
      }
    }).then(() => {
      setTestingVoiceId(voiceId);
      // Hard architectural cutoff strictly at 30 exact seconds to prevent massive usage costs
      callTimeoutRef.current = setTimeout(() => {
        vapiClient.stop();
        setTestingVoiceId(null);
        toast('Live Preview time limit safely reached (30s).', { icon: '⏱️' });
      }, 30000);
    }).catch((err: any) => {
      console.error(err);
      toast.error(`Start Failed: ${err?.message || err}. (If NotAllowedError, click the camera icon to allow microphone.)`);
      setTestingVoiceId(null);
    });
  };
  // ------------------------------------

  // Global Onboarding State
  const [formData, setFormData] = useState({
    firstName: 'Chanise',
    email: 'chanise777@gmail.com',
    personalPhone: '6619033468',
    assistantName: 'Sara',
    hasVoicemail: 'yes',
    language: 'English',
    agentTone: 'Professional',
    voiceGender: 'Female',
    firstMessage: 'Hi, this is Sara. Are you calling about real estate, business automation, or something else today?',
    tasks: 'To gather caller details, understand their needs, answer basic questions, and forward messages.',
    faqs: 'Q: What can you help me with?\nA: I can assist with real estate inquiries and scheduling.\n\nQ: When will I hear back?\nA: We follow up the same business day.',
    closingMessage: "Thanks! I'll make sure the team gets this message and follows up with you shortly. Have a great day!",
    carrier: 'Verizon'
  });

  const [isLoading, setIsLoading] = useState(false);

  // Carousel State for Step 4
  const [osType, setOsType] = useState<'Apple' | 'Android'>('Apple');
  const [carouselIndex, setCarouselIndex] = useState(0);

  const appleSteps = [
    { img: '/voicemail/apple-1.webp', title: 'Settings', desc: 'Open the Settings app' },
    { img: '/voicemail/apple-2.webp', title: 'Search', desc: 'Type "Live Voicemail" in search' },
    { img: '/voicemail/apple-3.webp', title: 'Find It', desc: 'Tap on Live Voicemail' },
    { img: '/voicemail/apple-4.webp', title: 'Disable', desc: 'Toggle the green switch off' },
  ];

  const androidSteps = [
    { img: '/voicemail/android-1.webp', title: 'Phone App', desc: 'Open your Phone app and tap the 3 dots (⋮) in the top right corner.' },
    { img: '/voicemail/android-2.webp', title: 'Settings', desc: 'Tap on Settings from the dropdown menu.' },
    { img: '/voicemail/android-3.webp', title: 'Find Call Screen', desc: 'Look for "Bixby Text Call" (Samsung) or "Call Screen" (Pixel).' },
    { img: '/voicemail/android-4.webp', title: 'Disable', desc: 'Toggle the feature completely OFF so calls can route past your device.' },
  ];

  const currentCarouselSteps = osType === 'Apple' ? appleSteps : androidSteps;

  // Reset carousel when OS switches
  useEffect(() => {
    setCarouselIndex(0);
  }, [osType]);

  const nextCarousel = () => { if (carouselIndex < currentCarouselSteps.length - 1) setCarouselIndex(p => p+1); };
  const prevCarousel = () => { if (carouselIndex > 0) setCarouselIndex(p => p-1); };

  // Handle Input Changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Nav Handlers
  const nextStep = () => {
    if (currentStep < totalSteps) setCurrentStep(prev => prev + 1);
  };
  const prevStep = () => {
    if (currentStep > 1) setCurrentStep(prev => prev - 1);
  };

  const [twilioNumber, setTwilioNumber] = useState('');

  // Automatically Fetch true assigned Twilio Number and Hydrate Agent Config
  useEffect(() => {
    fetch('/api/onboarding/me')
      .then(res => res.json())
      .then(data => {
        if (data.twilioNumber) {
          setTwilioNumber(data.twilioNumber.replace('+1', ''));
        }
        
        if (data.agentFormData) {
          setFormData(prev => ({
            ...prev,
            ...data.agentFormData,
            firstName: data.name || prev.firstName, // Merge existing names via payload scope
            email: data.email || prev.email,
          }));
        } else if (data.name) {
          setFormData(prev => ({ ...prev, firstName: data.name, email: data.email }));
        }
      })
      .catch(err => console.error("Error hydrating UI:", err));
  }, []);

  const applyTemplate = (type: string) => {
    if (type === 'personal') {
      setFormData(prev => ({ ...prev, 
        firstMessage: `Hi, you've reached ${prev.assistantName}, the personal AI assistant for ${prev.firstName}. ${prev.firstName} is unavailable right now. Can I take a message?`,
        tasks: `Politely answer the phone for ${prev.firstName}, inform the caller they are unavailable, and gather a detailed message including the caller's name, phone, and reason for calling.`,
        faqs: `Q: Where is ${prev.firstName}?\nA: They are currently occupied but I will ensure they get your message immediately.\n\nQ: Are you a robot?\nA: Yes, I am an AI assistant.`,
        closingMessage: `Thank you. I will make sure ${prev.firstName} gets this message right away. Have a wonderful day!`
      }));
      toast.success('Personal Assistant Template Applied!');
    } else if (type === 'outreach') {
      setFormData(prev => ({ ...prev, 
        firstMessage: `Thank you for calling ${prev.firstName}! This is ${prev.assistantName}. Are you in need of our services today?`,
        tasks: `Act as an inbound lead qualification agent. Ask the caller what services they are interested in, gather their core needs, name, and phone number, and see if they want to schedule a follow up.`,
        faqs: `Q: What are you selling?\nA: I am an AI assistant here to see how we can help you achieve your goals.\n\nQ: When can I speak to a real person?\nA: Our team will review your needs and follow up as soon as possible.`,
        closingMessage: `Great, I have noted all your details. Our team will be in touch with you shortly!`
      }));
      toast.success('Client Qualification Template Applied!');
    } else if (type === 'prayer') {
      setFormData(prev => ({ ...prev, 
        firstMessage: `God bless you. Thank you for calling ${prev.firstName}'s prayer line. This is ${prev.assistantName}. How can I pray for you today?`,
        tasks: `You are an inbound prayer ministry agent for ${prev.firstName}. Ask the caller what they are currently struggling with, listen with deep empathy, and offer a specific, tailored prayer over the phone for their exact situation (For example, if they mention financial stress, pray specifically for God's provision and open doors for employment). Assure them their request will be added to the prayer list.`,
        faqs: `Q: Can you pray for me now?\nA: Yes, absolutely. Heavenly Father, please bless this caller and grant them peace and guidance. In Jesus' name, Amen.`,
        closingMessage: `Thank you for sharing your heart. We will be continually praying for you. God bless you and have a beautiful day.`
      }));
      toast.success('Prayer Ministry Template Applied!');
    } else if (type === 'business') {
      setFormData(prev => ({ ...prev, 
        firstMessage: `Thank you for calling! This is ${prev.assistantName}. Are you calling to book an appointment, or do you have a general question?`,
        tasks: `Act as a professional front-desk receptionist. Answer general business questions, capture lead information for new prospects, and take messages for the staff.`,
        faqs: `Q: What are your hours?\nA: We are currently open Monday through Friday, 9am to 5pm.\n\nQ: Where are you located?\nA: We are a fully digital remote team.`,
        closingMessage: `Thank you for calling. I will pass your information along to the team. Have a great day!`
      }));
      toast.success('Business Receptionist Template Applied!');
    } else if (type === 'comedy') {
      setFormData(prev => ({ ...prev, 
        firstMessage: `Yo! You've reached ${prev.assistantName}, the highly caffeinated AI assistant for ${prev.firstName}. They are currently dodging my calls, so how can I help you?`,
        tasks: `Act as a sarcastic, witty, and highly entertaining AI assistant for ${prev.firstName}. Use dry humor, harmless jokes, and funny analogies while still actually taking down the caller's message, name, and phone number.`,
        faqs: `Q: Are you a real person?\nA: I'm just a very advanced calculator with a great sense of humor.\n\nQ: Where is ${prev.firstName}?\nA: Probably out saving the world, or maybe just napping. Honestly, it's a 50/50 toss up.`,
        closingMessage: `Alright, I've etched your message into my digital brain. I'll beep at ${prev.firstName} until they call you back. Catch ya later!`
      }));
      toast.success('Comedy Template Applied!');
    }
  };

  const getForwardingCodes = () => {
    // Failsafe fallback if dynamic fetch is slow
    const vapiNumber = twilioNumber || '3187129189';
    switch (formData.carrier) {
      case 'AT&T':
        // AT&T confirmed working — **61 no-answer forward
        return { activate: `**61*1${vapiNumber}#`, deactivate: `##61#` };
      case 'T-Mobile':
        // T-Mobile — conditional no-answer forward (GSM format)
        return { activate: `**61*1${vapiNumber}#`, deactivate: `##61#` };
      case 'Verizon':
        // Verizon unconditional forward
        return { activate: `**21*1${vapiNumber}#`, deactivate: `##21#` };
      case 'Sprint':
      case 'Default':
      default:
        return { activate: `**21*1${vapiNumber}#`, deactivate: `##21#` };
    }
  };

  const codes = getForwardingCodes();
  const activateQr = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=tel:${encodeURIComponent(codes.activate)}`;
  const deactivateQr = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=tel:${encodeURIComponent(codes.deactivate)}`;

  const handleTestCall = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/vapi/test-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personalPhone: formData.personalPhone })
      });
      if (res.ok) {
        toast.success('Test call placed! Your phone should ring in a few seconds.', { duration: 5000 });
      } else {
        const errorData = await res.json();
        toast.error('Could not place test call: ' + errorData.error);
      }
    } catch (err) {
      toast.error('Network error when attempting to call.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFinishAndDeploy = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        window.location.href = '/client-dashboard';
      } else {
        const errorData = await res.json();
        toast.error('Configuration failed: ' + errorData.error, { duration: 8000 });
        setIsLoading(false);
      }
    } catch (err) {
      toast.error('Network error when attempting to save settings.');
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.onboardingContainer}>
      <Toaster position="top-center" />
      <div className={styles.wizardBox}>
        {/* Step Indicators */}
        <div className={styles.stepsIndicator}>
          {[1, 2, 3, 4, 5, 6].map((step, index) => (
            <div key={step} style={{ display: 'flex', alignItems: 'center' }}>
              <div className={`${styles.stepDot} ${
                  currentStep === step ? styles.stepDotActive : ''
                } ${currentStep > step ? styles.stepDotCompleted : ''}`}
              />
              {index < 5 && (
                <div className={`${styles.stepLine} ${
                  currentStep > step ? styles.stepLineActive : ''
                }`} />
              )}
            </div>
          ))}
        </div>

        {/* --- STEP 1: CONTACT INFO --- */}
        {currentStep === 1 && (
          <div className={styles.stepContent}>
            <div className={styles.header}>
              <h1>Contact Information</h1>
              <p>Please provide your contact details so we can reach you.</p>
            </div>
            
            <div className={styles.formGroup}>
              <label>Email Address <span>*</span></label>
              <input type="email" name="email" value={formData.email} onChange={handleInputChange} className={styles.inputField} disabled />
            </div>
            
            <div className={styles.formGroup}>
              <label>First Name <span>*</span></label>
              <input type="text" name="firstName" value={formData.firstName} onChange={handleInputChange} className={styles.inputField} />
            </div>

            <div className={styles.formGroup}>
              <label>Personal Phone Number <span>*</span></label>
              <input type="tel" name="personalPhone" value={formData.personalPhone} onChange={handleInputChange} className={styles.inputField} />
            </div>

            <div className={styles.formGroup}>
              <label>Assistant Name <span>*</span></label>
              <input type="text" name="assistantName" value={formData.assistantName} onChange={handleInputChange} className={styles.inputField} />
            </div>

            <div className={styles.formGroup}>
              <label>Do you have voicemail enabled on your mobile device? <span>*</span></label>
              <div className={styles.selectionGrid}>
                <div className={`${styles.selectionBox} ${formData.hasVoicemail === 'yes' ? styles.selectionBoxActive : ''}`} onClick={() => setFormData({...formData, hasVoicemail: 'yes'})}>
                  <h3>Yes</h3>
                </div>
                <div className={`${styles.selectionBox} ${formData.hasVoicemail === 'no' ? styles.selectionBoxActive : ''}`} onClick={() => setFormData({...formData, hasVoicemail: 'no'})}>
                  <h3>No</h3>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- STEP 2: LANGUAGE & VOICE --- */}
        {currentStep === 2 && (
          <div className={styles.stepContent}>
            <div className={styles.header}>
              <h1>Language &amp; Voice</h1>
              <p>Choose how your personal assistant should communicate.</p>
            </div>

            <div className={styles.formGroup}>
              <label>Language <span>*</span></label>
              <select name="language" value={formData.language} onChange={handleInputChange} className={styles.inputField}>
                <option value="English">English</option>
                <option value="Spanish">Spanish</option>
                <option value="French">French</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label>Agent Tone <span>*</span></label>
              <div className={styles.selectionGrid}>
                <div className={`${styles.selectionBox} ${formData.agentTone === 'Professional' ? styles.selectionBoxActive : ''}`} onClick={() => setFormData({...formData, agentTone: 'Professional'})}>
                  <h3>Professional</h3>
                </div>
                <div className={`${styles.selectionBox} ${formData.agentTone === 'Friendly' ? styles.selectionBoxActive : ''}`} onClick={() => setFormData({...formData, agentTone: 'Friendly'})}>
                  <h3>Friendly</h3>
                </div>
              </div>
            </div>

            <div className={styles.formGroup}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <label style={{ margin: 0 }}>Select a Premium Voice <span>*</span></label>
                <button 
                  onClick={async (e) => {
                    e.preventDefault();
                    try {
                      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                      toast.success("Microphone and speaker access established successfully!", { icon: '✅' });
                      stream.getTracks().forEach(track => track.stop());
                    } catch (err: any) {
                      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                        toast.error(
                          "Microphone access is blocked! Please click the camera icon in your URL bar at the top right to 'Allow' access.",
                          { duration: 8000, icon: '🛑' }
                        );
                      } else {
                        toast.error("Could not access microphone: " + err.message);
                      }
                    }
                  }}
                  style={{ 
                    padding: '8px 16px', 
                    borderRadius: '20px', 
                    backgroundColor: '#eff6ff', 
                    color: '#2563eb', 
                    border: '1px solid #bfdbfe', 
                    fontWeight: 600, 
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  🎙️ Test Microphone Connection
                </button>
              </div>
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#334155', marginBottom: '12px' }}>Female Voices</h3>
                <div className={styles.selectionGrid} style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '16px' }}>
                  {femaleVoices.map(voice => (
                    <div 
                      key={voice.id}
                      className={`${styles.selectionBox} ${formData.voiceGender === voice.id ? styles.selectionBoxActive : ''}`} 
                      onClick={() => setFormData({...formData, voiceGender: voice.id})}
                      style={{ padding: '16px', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', justifyContent: 'center', textAlign: 'center' }}
                    >
                      <span style={{ fontWeight: '600', fontSize: '14px', color: '#1e293b' }}>{voice.label}</span>
                      
                      {/* Live Interactive Microphone Audio Button */}
                      <button 
                        onClick={(e) => handlePreviewVoice(voice.id, voice.label, e)}
                        className="absolute bottom-3 right-3 p-2 rounded-full bg-blue-100 hover:bg-blue-200 text-blue-600 transition-colors shadow-sm z-10"
                        title="Test this voice live with your microphone"
                      >
                        {testingVoiceId === voice.id + '-loading' ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : testingVoiceId === voice.id ? (
                          <Square size={16} className="fill-current animate-pulse text-red-500" />
                        ) : (
                          <Play size={16} className="fill-current ml-0.5" />
                        )}
                      </button>
                      
                      {/* Show active indicator ring prominently around box if explicitly being tested */}
                      {testingVoiceId === voice.id && (
                         <div className="absolute inset-0 rounded-xl border-2 border-blue-400 animate-pulse pointer-events-none"></div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#334155', marginBottom: '12px' }}>Male Voices</h3>
                <div className={styles.selectionGrid} style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '16px' }}>
                  {maleVoices.map(voice => (
                    <div 
                      key={voice.id}
                      className={`${styles.selectionBox} ${formData.voiceGender === voice.id ? styles.selectionBoxActive : ''}`} 
                      onClick={() => setFormData({...formData, voiceGender: voice.id})}
                      style={{ padding: '16px', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', justifyContent: 'center', textAlign: 'center' }}
                    >
                      <span style={{ fontWeight: '600', fontSize: '14px', color: '#1e293b' }}>{voice.label}</span>
                      
                      {/* Live Interactive Microphone Audio Button */}
                      <button 
                        onClick={(e) => handlePreviewVoice(voice.id, voice.label, e)}
                        className="absolute bottom-3 right-3 p-2 rounded-full bg-blue-100 hover:bg-blue-200 text-blue-600 transition-colors shadow-sm z-10"
                        title="Test this voice live with your microphone"
                      >
                        {testingVoiceId === voice.id + '-loading' ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : testingVoiceId === voice.id ? (
                          <Square size={16} className="fill-current animate-pulse text-red-500" />
                        ) : (
                          <Play size={16} className="fill-current ml-0.5" />
                        )}
                      </button>
                      
                      {/* Show active indicator ring prominently around box if explicitly being tested */}
                      {testingVoiceId === voice.id && (
                         <div className="absolute inset-0 rounded-xl border-2 border-blue-400 animate-pulse pointer-events-none"></div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- STEP 3: ASSISTANT SETUP (PROMPT) --- */}
        {currentStep === 3 && (
          <div className={styles.stepContent}>
            <div className={styles.header}>
              <h1>Assistant Setup</h1>
              <p>Configure the exact instructions for your personal assistant.</p>
            </div>

            {/* Quick Fill Templates */}
            <div style={{ marginBottom: '32px', padding: '20px', backgroundColor: '#f0fdf4', borderRadius: '16px', border: '1px solid #bbf7d0' }}>
              <h3 style={{ fontSize: '15px', margin: '0 0 12px 0', color: '#166534', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '18px' }}>⚡</span> Quick-Fill AI Templates
              </h3>
              <p style={{ fontSize: '13px', color: '#15803d', margin: '0 0 16px 0' }}>Select a use-case below to instantly auto-fill the optimum psychological configuration for your robot.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                <button onClick={() => applyTemplate('personal')} style={{ background: '#ffffff', border: '1px solid #86efac', color: '#166534', padding: '12px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }} onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}>👤 Personal Assistant</button>
                <button onClick={() => applyTemplate('outreach')} style={{ background: '#ffffff', border: '1px solid #86efac', color: '#166534', padding: '12px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }} onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}>🚀 Client Qualification</button>
                <button onClick={() => applyTemplate('prayer')} style={{ background: '#ffffff', border: '1px solid #86efac', color: '#166534', padding: '12px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }} onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}>🙏 Prayer Ministry</button>
                <button onClick={() => applyTemplate('business')} style={{ background: '#ffffff', border: '1px solid #86efac', color: '#166534', padding: '12px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }} onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}>🏢 Business Receptionist</button>
                <button onClick={() => applyTemplate('comedy')} style={{ background: '#ffffff', border: '1px solid #86efac', color: '#166534', padding: '12px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }} onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}>😂 Comedy Assistant</button>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label>First Message <span>*</span></label>
              <textarea name="firstMessage" value={formData.firstMessage} onChange={handleInputChange} className={styles.textareaField} />
            </div>

            <div className={styles.formGroup}>
              <label>Tasks <span>*</span></label>
              <textarea name="tasks" value={formData.tasks} onChange={handleInputChange} className={styles.textareaField} style={{minHeight: '120px'}} />
            </div>

            <div className={styles.formGroup}>
              <label>Frequently Asked Questions <span>*</span></label>
              <p style={{fontSize: '12px', color: '#6b7280', margin: '-4px 0 8px 0'}}>Enter questions and answers to build your AI's knowledge base.</p>
              <textarea name="faqs" value={formData.faqs} onChange={handleInputChange} className={styles.textareaField} style={{minHeight: '180px'}} />
            </div>

            <div className={styles.formGroup}>
              <label>Closing Message <span>*</span></label>
              <textarea name="closingMessage" value={formData.closingMessage} onChange={handleInputChange} className={styles.textareaField} />
            </div>
          </div>
        )}

        {/* --- NEW STEP 4: DISABLE VOICEMAIL IMAGE CAROUSEL --- */}
        {currentStep === 4 && (
          <div className={styles.stepContent}>
            <div className={styles.header}>
              <h1>Step 1: Disable Voicemail</h1>
              <p style={{fontSize: '16px'}}>You need to disable voicemail before setting up call forwarding.</p>
            </div>

            {/* Apple / Android OS Toggle Switch */}
            <div style={{ display: 'flex', justifyContent: 'center', margin: '20px 0 30px 0' }}>
              <div style={{ display: 'flex', backgroundColor: '#f1f5f9', padding: '4px', borderRadius: '12px' }}>
                <button 
                  onClick={() => setOsType('Apple')}
                  style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: osType === 'Apple' ? '#fff' : 'transparent', color: osType === 'Apple' ? '#0f172a' : '#64748b', fontWeight: osType === 'Apple' ? 'bold' : 'normal', boxShadow: osType === 'Apple' ? '0 2px 8px rgba(0,0,0,0.05)' : 'none', cursor: 'pointer', transition: 'all 0.2s', fontSize: '14px' }}>
                  🍎 Apple iOS
                </button>
                <button 
                  onClick={() => setOsType('Android')}
                  style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: osType === 'Android' ? '#fff' : 'transparent', color: osType === 'Android' ? '#0f172a' : '#64748b', fontWeight: osType === 'Android' ? 'bold' : 'normal', boxShadow: osType === 'Android' ? '0 2px 8px rgba(0,0,0,0.05)' : 'none', cursor: 'pointer', transition: 'all 0.2s', fontSize: '14px' }}>
                  🤖 Android
                </button>
              </div>
            </div>

            {/* Interactive Image Carousel */}
            <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '24px', padding: '30px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', minHeight: '380px' }}>
              
              <button onClick={prevCarousel} disabled={carouselIndex === 0} style={{ width: '40px', height: '40px', borderRadius: '50%', border: '1px solid #cbd5e1', backgroundColor: '#fff', cursor: carouselIndex === 0 ? 'not-allowed' : 'pointer', opacity: carouselIndex === 0 ? 0.3 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                ‹
              </button>
              
              <div style={{ flex: 1, textAlign: 'center', maxWidth: '480px' }}>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '20px' }}>
                  {currentCarouselSteps.map((_, idx) => (
                    <div key={idx} style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: carouselIndex === idx ? '#10b981' : '#cbd5e1', transition: 'background-color 0.3s' }} />
                  ))}
                </div>

                <div style={{ width: '100%', minHeight: '350px', backgroundColor: '#fff', borderRadius: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0', padding: '40px', textAlign: 'center' }}>
                  <div style={{ width: '72px', height: '72px', backgroundColor: '#eff6ff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', marginBottom: '24px', color: '#3b82f6', fontWeight: 'bold', flexShrink: 0 }}>
                    {carouselIndex + 1}
                  </div>
                  <h3 style={{ margin: '0 0 16px 0', fontSize: '28px', color: '#0f172a', fontWeight: '700', letterSpacing: '-0.5px' }}>{currentCarouselSteps[carouselIndex].title}</h3>
                  <p style={{ margin: 0, fontSize: '18px', color: '#64748b', lineHeight: '1.6', maxWidth: '320px' }}>{currentCarouselSteps[carouselIndex].desc}</p>
                  
                  {carouselIndex === 3 && osType === 'Apple' && (
                    <div style={{ marginTop: '28px', width: '100%', maxWidth: '280px', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0' }}>
                      <img src="/voicemail/step4-helper.jpg" alt="Instructional Screenshot" style={{ width: '100%', height: 'auto', display: 'block' }} />
                    </div>
                  )}

                  {carouselIndex === 3 && osType === 'Android' && (
                    <div style={{ marginTop: '28px', width: '100%', maxWidth: '300px', backgroundColor: '#fff', borderRadius: '16px', boxShadow: '0 8px 24px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0', padding: '0', overflow: 'hidden', textAlign: 'left' }}>
                      <div style={{ backgroundColor: '#f8fafc', padding: '12px 16px', borderBottom: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Android Settings Examples
                      </div>
                      
                      <div style={{ padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', backgroundColor: '#fefce8' }}>
                        <div>
                          <h4 style={{ margin: '0 0 4px 0', fontSize: '15px', color: '#0f172a', fontWeight: '600' }}>Bixby text call</h4>
                          <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>Samsung Devices</p>
                        </div>
                        <div style={{ width: '44px', height: '24px', backgroundColor: '#e2e8f0', borderRadius: '12px', position: 'relative', border: '2px solid #facc15' }}>
                          <div style={{ width: '18px', height: '18px', backgroundColor: '#fff', borderRadius: '50%', position: 'absolute', top: '1px', left: '1px', boxShadow: '0 2px 4px rgba(0,0,0,0.15)' }}></div>
                        </div>
                      </div>

                      <div style={{ padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fefce8' }}>
                        <div>
                          <h4 style={{ margin: '0 0 4px 0', fontSize: '15px', color: '#0f172a', fontWeight: '600' }}>Call Screen</h4>
                          <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>Google Pixel Devices</p>
                        </div>
                        <div style={{ width: '44px', height: '24px', backgroundColor: '#e2e8f0', borderRadius: '12px', position: 'relative', border: '2px solid #facc15' }}>
                          <div style={{ width: '18px', height: '18px', backgroundColor: '#fff', borderRadius: '50%', position: 'absolute', top: '1px', left: '1px', boxShadow: '0 2px 4px rgba(0,0,0,0.15)' }}></div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ marginTop: '24px', backgroundColor: '#64748b', color: '#fff', padding: '12px 24px', borderRadius: '24px', display: 'inline-block', fontSize: '14px', fontWeight: '500' }}>
                  {currentCarouselSteps[carouselIndex].desc}
                </div>
              </div>

              <button onClick={nextCarousel} disabled={carouselIndex === currentCarouselSteps.length - 1} style={{ width: '40px', height: '40px', borderRadius: '50%', border: '1px solid #cbd5e1', backgroundColor: '#fff', cursor: carouselIndex === currentCarouselSteps.length - 1 ? 'not-allowed' : 'pointer', opacity: carouselIndex === currentCarouselSteps.length - 1 ? 0.3 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                ›
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '40px' }}>
              <button 
                className={styles.btnNext} 
                onClick={nextStep} 
                style={{ backgroundColor: '#2563eb', padding: '16px 32px', fontSize: '16px', borderRadius: '12px', width: 'auto' }}
              >
                I've Disabled Voicemail, Continue
              </button>
            </div>
            
          </div>
        )}

        {/* --- STEP 5: CARRIER CONFIGURATION & QR CODES --- */}
        {currentStep === 5 && (
          <div className={styles.stepContent}>
            <div className={styles.header}>
              <h1>Activate Call Forwarding</h1>
              <p>Use these tools to manage your call forwarding directly from your phone.</p>
            </div>

            <div className={styles.formGroup}>
              <label style={{textAlign: 'center', marginBottom: '16px'}}>Select your mobile provider to see the correct codes</label>
              <div className={styles.selectionGrid} style={{gridTemplateColumns: 'repeat(4, 1fr)'}}>
                {['AT&T', 'Verizon', 'T-Mobile', 'Default'].map(carrier => (
                  <div key={carrier} className={`${styles.selectionBox} ${formData.carrier === carrier ? styles.selectionBoxActive : ''}`} onClick={() => setFormData({...formData, carrier})}>
                    <h3 style={{fontSize: '14px'}}>{carrier}</h3>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '30px' }}>
              {/* ACTIVATE CARD */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px', textAlign: 'center', backgroundColor: '#f8fafc' }}>
                <h3 style={{ color: '#0f172a', margin: '0 0 8px 0' }}>Activate Forwarding</h3>
                <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 20px 0' }}>Ring 3 times, then send to AI</p>
                
                <div style={{ backgroundColor: '#fff', border: '1px solid #cbd5e1', padding: '16px', borderRadius: '12px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <code style={{ fontSize: '20px', fontWeight: 'bold', color: '#2563eb' }}>{codes.activate}</code>
                  <button onClick={() => { navigator.clipboard.writeText(codes.activate); toast.success('Copied!'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', padding: '4px' }} title="Copy to Clipboard">📋</button>
                </div>
                
                <p style={{ color: '#475569', fontSize: '14px', margin: '16px 0', lineHeight: '1.5' }}>
                  <strong>Step 1:</strong> Open your Phone App<br/>
                  <strong>Step 2:</strong> Type the code above<br/>
                  <strong>Step 3:</strong> Press the Green Call Button
                </p>
              </div>

              {/* DEACTIVATE CARD */}
              <div style={{ border: '1px solid #fee2e2', borderRadius: '16px', padding: '24px', textAlign: 'center', backgroundColor: '#fef2f2' }}>
                <h3 style={{ color: '#991b1b', margin: '0 0 8px 0' }}>Deactivate Forwarding</h3>
                <p style={{ color: '#ef4444', fontSize: '13px', margin: '0 0 20px 0' }}>Receive calls directly to voicemail</p>
                
                <div style={{ backgroundColor: '#fff', border: '1px solid #fca5a5', padding: '16px', borderRadius: '12px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <code style={{ fontSize: '20px', fontWeight: 'bold', color: '#dc2626' }}>{codes.deactivate}</code>
                  <button onClick={() => { navigator.clipboard.writeText(codes.deactivate); toast.success('Copied!'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', padding: '4px' }} title="Copy to Clipboard">📋</button>
                </div>
                
                <p style={{ color: '#b91c1c', fontSize: '14px', margin: '16px 0', lineHeight: '1.5' }}>
                  <strong>Step 1:</strong> Open your Phone App<br/>
                  <strong>Step 2:</strong> Type the code above<br/>
                  <strong>Step 3:</strong> Press the Green Call Button
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginTop: '30px' }}>
              <button className={styles.btnBack} onClick={prevStep} style={{ padding: '12px 32px' }}>
                Back
              </button>
              <button className={styles.btnBack} onClick={nextStep} style={{ color: '#059669', borderColor: '#10b981', padding: '12px 32px' }}>
                I've Completed Activation
              </button>
            </div>
            
            <p style={{fontSize: '11px', color: '#94a3b8', textAlign: 'center', marginTop: '24px'}}>
              Note: USSD codes may vary by carrier. If these codes don't work for your specific provider, please contact your mobile service provider for assistance.
            </p>
          </div>
        )}

        {/* --- STEP 6: TEST CALL --- */}
        {currentStep === 6 && (
          <div className={styles.stepContent}>
            <div className={styles.header}>
              <h1>Test Your Agent</h1>
              <p>Click the button below to test your personal assistant live.</p>
            </div>

            <div style={{ textAlign: 'center', margin: '40px 0' }}>
              <p style={{ fontSize: '18px', color: '#374151', marginBottom: '30px' }}>
                Target phone number to dial: <strong>{formData.personalPhone}</strong>
              </p>
              <button onClick={handleTestCall} className={styles.btnNext} style={{ margin: '0 auto', fontSize: '18px', padding: '16px 32px' }} disabled={isLoading}>
                {isLoading ? 'Dialing...' : '📞 Make Test Call'}
              </button>
            </div>
          </div>
        )}

        {/* Global Navigation Buttons (Hidden explicitly on Step 4 and 5 because they contain their own custom confirmation actions) */}
        {currentStep !== 4 && currentStep !== 5 && (
          <div className={styles.buttonContainer}>
            {currentStep > 1 ? (
              <button className={styles.btnBack} onClick={prevStep}>Back</button>
            ) : <div></div>}
            
            {currentStep < totalSteps ? (
              <button className={styles.btnNext} onClick={nextStep}>Continue</button>
            ) : (
              <button className={styles.btnNext} onClick={handleFinishAndDeploy} disabled={isLoading}>
                {isLoading ? 'Deploying AI... (Please wait ~10s)' : 'Finish & Go to Dashboard'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
