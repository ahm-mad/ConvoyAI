// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { useState } from 'react';
import { Mail, User, MessageSquare, Clock, ArrowLeft, Trash2 } from 'lucide-react';
import { useSimpleQuery } from '@hooks/useSimpleQuery';
import { del } from '../utils/apiHelper';

export default function ContactNotificationSlides({ NotificationsSkeleton }) {
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const {
    data: contactData,
    isLoading,
    isError,
    refetch,
  } = useSimpleQuery(['contact-messages'], '/api/contact', {});

  const messages = Array.isArray(contactData?.data?.data) ? contactData.data.data : [];

  const handleMessageClick = msg => {
    setSelectedMessage(msg);
  };

  const handleBackToList = () => {
    setSelectedMessage(null);
  };

  const handleDelete = async (msgId, e) => {
    e?.stopPropagation();

    setDeletingId(msgId);

    try {
      const response = await del(`/api/contact/${msgId}`, {}, true);

      if (response?.success) {
        // If we're viewing the deleted message, go back to list
        if (selectedMessage?.id === msgId) {
          setSelectedMessage(null);
        }
        // Refetch the messages list
        refetch();
      }
    } catch (error) {
      console.error('Error deleting message:', error);
    } finally {
      setDeletingId(null);
    }
  };

  const unreadCount = messages.filter(m => m.status === 'unread').length;

  // Loading state - Show skeleton
  if (isLoading) {
    return NotificationsSkeleton ? <NotificationsSkeleton /> : null;
  }

  // Error state
  if (isError) {
    return (
      <div className="border border-line-soft rounded-md">
        <div className="h-[440px] flex items-center justify-center">
          <div className="text-center">
            <Mail className="mx-auto text-danger mb-4" size={64} />
            <h2 className="text-base font-semibold text-ink-0 mb-2">Error loading messages</h2>
            <p className="text-ink-2 text-sm">Failed to load contact messages. Please try again.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-line-soft rounded-md overflow-y-scroll no-scrollbar">
      <div className="h-[440px]">
        <div className="bg-surface-1 flex items-center gap-4 rounded-t-sm p-5 border-b border-line-soft">
          {selectedMessage && (
            <button
              onClick={handleBackToList}
              className="flex items-center cursor-pointer gap-2 text-ink-1 hover:bg-surface-3 px-3 py-2 rounded-md transition-colors"
            >
              <ArrowLeft size={20} />
              <span className="font-medium">Back</span>
            </button>
          )}

          <div className="flex items-center gap-2">
            <h1 className="font-semibold text-base text-ink-0">
              {selectedMessage ? selectedMessage.name : 'Notifications'}
            </h1>
            {!selectedMessage && unreadCount > 0 && (
              <span className="bg-accent-cyan on-gradient text-xs font-semibold px-2 py-0.5 rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
        </div>

        {/* Content Area with Smooth Transition */}
        <div className="bg-surface-1 overflow-hidden relative">
          {/* List View */}
          <div
            className={`transition-all duration-300 ease-in-out ${
              selectedMessage
                ? 'opacity-0 absolute inset-0 pointer-events-none'
                : 'opacity-100 relative'
            } ${messages.length > 4 ? 'max-h-[600px] overflow-y-auto' : ''}`}
          >
            {messages.length === 0 ? (
              <div className="p-24 text-center">
                <Mail className="mx-auto text-ink-2 mb-4" size={60} />
                <h2 className="text-base font-semibold text-ink-0 mb-2">No messages</h2>
              </div>
            ) : (
              <div className="divide-y divide-line-soft">
                {messages.map(msg => (
                  <div
                    key={msg.id}
                    onClick={() => handleMessageClick(msg)}
                    className={`p-3 cursor-pointer transition-colors hover:bg-surface-3 ${
                      msg.status === 'unread' ? 'bg-accent-cyan/5' : ''
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className="bg-accent-cyan p-2 mt-1 rounded-full flex-shrink-0">
                        <User className="on-gradient" size={20} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {msg.created_at && (
                            <span className="text-ink-2 text-xs font-mono">
                              {new Date(msg.created_at).toLocaleDateString()}
                            </span>
                          )}
                          {msg.status === 'unread' && (
                            <span className="w-1.5 h-1.5 bg-accent-green rounded-full ml-auto shadow-[0_0_4px_var(--color-accent-green)]"></span>
                          )}
                        </div>
                        <h3 className="font-semibold text-ink-0 text-sm mb-1">{msg.name}</h3>
                        <p className="text-ink-2 text-xs line-clamp-2">{msg.message}</p>
                      </div>
                      <button
                        onClick={e => handleDelete(msg.id, e)}
                        disabled={deletingId === msg.id}
                        className="flex-shrink-0 cursor-pointer p-2 text-danger hover:bg-danger/10 rounded-md transition-colors disabled:opacity-50"
                        title="Delete message"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Detail View */}
          {selectedMessage && (
            <div className="p-6 shadow-sm animate-fade-in space-y-6">
              {/* Delete button in detail view */}
              <div className="flex justify-end">
                <button
                  onClick={e => handleDelete(selectedMessage.id, e)}
                  disabled={deletingId === selectedMessage.id}
                  className="flex items-center gap-2 px-4 py-2 text-danger hover:bg-danger/10 rounded-md transition-colors disabled:opacity-50"
                >
                  <Trash2 size={18} />
                  <span>Delete Message</span>
                </button>
              </div>

              {/* Contact Info */}
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <h2 className="text-sm font-semibold text-ink-0 mb-3 uppercase tracking-wider">
                    Contact information
                  </h2>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-ink-1 mb-2 text-sm">
                    <span className="font-medium w-20">Name:</span>
                    <span className="text-ink-0">{selectedMessage.name}</span>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-ink-1 text-sm">
                    <span className="font-medium w-20">Email:</span>
                    <a
                      href={`mailto:${selectedMessage.email}`}
                      className="text-brand-text hover:underline break-all font-mono text-xs"
                    >
                      {selectedMessage.email}
                    </a>
                  </div>
                </div>
              </div>

              {/* Subject (if available) */}
              {selectedMessage.subject && (
                <div className="border-t border-line-soft pt-4">
                  <h3 className="text-sm font-semibold text-ink-0 mb-2 uppercase tracking-wider">
                    Subject
                  </h3>
                  <p className="text-ink-1 text-sm">{selectedMessage.subject}</p>
                </div>
              )}

              {/* Message */}
              <div className="border-t border-line-soft pt-4">
                <h3 className="text-sm font-semibold text-ink-0 mb-2 uppercase tracking-wider">
                  Message
                </h3>
                <div className="bg-surface-2 border border-line-soft rounded-md p-4">
                  <p className="text-ink-1 text-sm leading-relaxed whitespace-pre-wrap">
                    {selectedMessage.message}
                  </p>
                </div>
              </div>

              {/* Timestamp */}
              {selectedMessage.created_at && (
                <div className="border-t border-line-soft pt-4">
                  <div className="flex items-center gap-2 text-ink-2 text-xs font-mono">
                    <Clock size={16} />
                    <span>Received on {new Date(selectedMessage.created_at).toLocaleString()}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
