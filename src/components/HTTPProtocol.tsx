import React from 'react';
import { useTranslation } from 'react-i18next';
import { Info, Copy, Link2 } from 'lucide-react';

const HTTPProtocol = ({ webHookToken, handleCopy }) => {
  const { t } = useTranslation();

  return (
    <div className="p-6 bg-surface-1 rounded-md">
      {/* Instructions Section */}
      <div className="mb-6 bg-accent-cyan/5 border border-accent-cyan/20 rounded-md p-4">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink-0 mb-2 uppercase tracking-wider">
          <Info className="w-3.5 h-3.5 text-accent-cyan" />
          Instructions
        </h3>
        <div className="text-xs text-ink-1 space-y-2">
          <p>Configure your server with the webhook URL and token:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Copy the webhook URL provided below</li>
            <li>Click on the token to copy it to your clipboard</li>
            <li>Configure your server with both URL and token</li>
            <li>Include the token in your HTTP request headers for authentication</li>
            <li>
              <strong className="text-warning">Important:</strong> Send initial packet to test the
              connection
            </li>
          </ul>
        </div>
      </div>

      {/* Webhook Configuration */}
      <div className="p-4 border border-line-soft rounded-md space-y-3">
        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-ink-1 mb-1">
            <Link2 className="w-3 h-3 text-ink-2" />
            {t('httpProtocol.webhookUrl')}
          </label>
          <div className="text-accent-cyan font-mono text-xs break-all bg-surface-2 p-2 rounded-md border border-line-soft">
            https://api.example.com/api/webhook
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-1 mb-1">
            {t('httpProtocol.token')}
          </label>
          <button
            type="button"
            className="w-full flex items-center justify-between gap-2 cursor-pointer bg-surface-2 p-2 rounded-md border border-line-soft hover:bg-surface-3 hover:border-accent-cyan/40 transition-colors text-left"
            onClick={handleCopy}
            title={t('httpProtocol.copyTokenTitle')}
          >
            <span className="font-mono text-xs text-ink-0 break-all">
              {webHookToken || t('httpProtocol.tokenPlaceholder')}
            </span>
            <Copy className="w-3.5 h-3.5 text-ink-2 shrink-0" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default HTTPProtocol;
