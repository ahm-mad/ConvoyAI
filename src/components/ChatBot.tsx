// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { Close as CloseIcon, Send as SendIcon, Chat as ChatIcon } from '@components/ui/icons';
import React, { useState, useEffect } from 'react';
import GlobalInput from './Input';
// import sendTune from '@assets/sounds/send.mp3';

const Chatbot = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');

  useEffect(() => {
    const fetchMessages = async () => {
      const data = [
        { id: 1, text: 'Hi! How can I help you today?', sender: 'bot' },
        { id: 2, text: 'Tell me more!', sender: 'user' },
      ];
      setMessages(data);
    };
    fetchMessages();
  }, []);

  const handleSendMessage = () => {
    if (input.trim()) {
      // const audio = new Audio(sendTune);
      // audio.play().catch(error => console.error('Audio playback failed:', error));
      setMessages([...messages, { id: messages.length + 1, text: input, sender: 'user' }]);
      setInput('');
    }
  };

  return (
    <div className="fixed bottom-5 right-3 z-[1000]">
      {/* Chat Icon */}
      <button
        onClick={() => setOpen(!open)}
        className="p-3 bg-primary text-background-lightest rounded-full shadow-xl hover:bg-primary-dark hover:cursor-pointer transition"
      >
        <ChatIcon />
      </button>

      {/* Chatbox */}
      <div
        className={` rounded-xl shadow-2xl overflow-hidden flex flex-col    absolute bottom-16 right-0 transition-all duration-300 transform ${
          open ? 'h-[450px] w-96' : 'h-0 w-0'
        }`}
      >
        {/* Header */}
        <div className="bg-primary text-background-lightest  p-3 flex justify-between items-center rounded-t-xl">
          <span className="font-semibold">Chirp Tech</span>
          <button onClick={() => setOpen(false)}>
            <CloseIcon className="hover:scale-110 cursor-pointer transition-all" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 p-4 overflow-auto bg-background-lightest  space-y-3">
          {messages.map(msg => (
            <div
              key={msg.id}
              className={`flex items-end ${msg.sender === 'user' ? 'justify-end' : ''}`}
            >
              <div
                className={`p-1 px-2 rounded-lg text-sm shadow-sm w-fit max-w-xs break-words overflow-hidden ${
                  msg.sender === 'user'
                    ? 'bg-primary text-background-lightest  self-end rounded-tr-none'
                    : 'bg-background text-text-dark rounded-tl-none'
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}
        </div>

        {/* Input Field */}
        <div className="p-3 flex bg-background-lightest  items-center">
          <div className="relative flex-1">
            <GlobalInput
              type="text"
              size="small"
              multiline
              maxRows={3}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Type a message..."
              className="w-full focus:outline-none text-sm rounded-full pr-24"
            />

            {/* Icons Container */}
            <div className="absolute right-4 top-1/2 transform -translate-y-1/2 flex space-x-2">
              {/* <button className="text-gray-500 hover:text-gray-700 transition transform hover:scale-110">
                <InsertEmoticonIcon fontSize="small" />
              </button> */}
              {!input.trim() ? (
                <>
                  {/* <button className="text-gray-500 hover:text-gray-700 transition transform hover:scale-110">
                    <GifIcon fontSize="small" />
                  </button>
                  <button className="text-gray-500 hover:text-gray-700 transition transform hover:scale-110">
                    <AttachFileIcon fontSize="small" />
                  </button> */}
                </>
              ) : (
                <button
                  onClick={handleSendMessage}
                  className="p-2 cursor-pointer text-primary transition transform hover:scale-105"
                >
                  <SendIcon fontSize="small" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Chatbot;
