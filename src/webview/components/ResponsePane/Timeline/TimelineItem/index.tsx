import { useState } from 'react';
import { IconChevronDown, IconChevronRight } from '@tabler/icons';
import { useTheme } from 'providers/Theme';
import Network from './Network/index';
import Request from './Request/index';
import Response from './Response/index';
import Method from './Common/Method/index';
import Status from './Common/Status/index';
import { RelativeTime } from './Common/Time/index';
import StyledWrapper from './StyledWrapper';

interface TimelineItemProps {
  timestamp?: React.ReactNode;
  request?: React.ReactNode;
  response?: React.ReactNode;
  item?: React.ReactNode;
  collection?: React.ReactNode;
  isOauth2?: boolean;
  hideTimestamp?: string;
}

const TimelineItem = ({
  timestamp,
  request,
  response,
  item,
  collection,
  isOauth2,
  hideTimestamp = false
}: any) => {
  const { theme } = useTheme();
  const [isExpanded, _toggleExpand] = useState(false);
  const [activeTab, setActiveTab] = useState('request');
  const toggleExpand = () => _toggleExpand((prev) => !prev);
  const handleRowKeyDown = (ev: React.KeyboardEvent) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      toggleExpand();
    }
  };
  const { method, status, statusCode, statusText, url = '' } = request || {};
  const { status: responseStatus, statusCode: responseStatusCode, statusText: responseStatusText } = response || {};
  const showNetworkLogs = response?.timeline?.length > 0;

  return (
    <StyledWrapper>
      <div className={`timeline-item ${isOauth2 ? 'timeline-item--oauth2' : ''}`}>
        <div
          className="oauth-request-item-header relative cursor-pointer flex items-center justify-between gap-3 min-w-0"
          role="button"
          tabIndex={0}
          aria-expanded={isExpanded}
          onClick={toggleExpand}
          onKeyDown={handleRowKeyDown}
          data-testid="timeline-item-header"
        >
          <span className="timeline-item-chevron flex-shrink-0" aria-hidden="true">
            {isExpanded ? <IconChevronDown size={14} strokeWidth={2} /> : <IconChevronRight size={14} strokeWidth={2} />}
          </span>
          <Status statusCode={responseStatus || responseStatusCode} statusText={responseStatusText} />
          <div className="flex items-center gap-1">
            <Method method={method} />
            <div className="truncate flex-1 min-w-0" data-testid="timeline-url">{url}</div>
            {isOauth2 && <span className="text-xs flex-shrink-0" style={{ color: theme.colors.text.muted }}>[oauth2.0]</span>}
          </div>
          {!hideTimestamp && (
            <span className="flex-shrink-0 ml-auto">
              <RelativeTime timestamp={timestamp} />
            </span>
          )}
        </div>
        {isExpanded && (
          <div className="timeline-item-content" data-testid="timeline-item-detail">
            <div className="timeline-item-tabs">
              <button
                className={`timeline-item-tab ${activeTab === 'request' ? 'timeline-item-tab--active' : ''}`}
                onClick={() => setActiveTab('request')}
              >
                Request
              </button>
              <button
                className={`timeline-item-tab ${activeTab === 'response' ? 'timeline-item-tab--active' : ''}`}
                onClick={() => setActiveTab('response')}
              >
                Response
              </button>
              {showNetworkLogs && (
                <button
                  className={`timeline-item-tab ${activeTab === 'networkLogs' ? 'timeline-item-tab--active' : ''}`}
                  onClick={() => setActiveTab('networkLogs')}
                >
                  Network Logs
                </button>
              )}
            </div>

            <div className="timeline-item-tab-content">
              {activeTab === 'request' && (
                <Request request={request} item={item} collection={collection} />
              )}

              {activeTab === 'response' && (
                <Response response={response} item={item} collection={collection} />
              )}

              {activeTab === 'networkLogs' && showNetworkLogs && (
                <Network logs={response?.timeline} />
              )}
            </div>
          </div>
        )}
      </div>
    </StyledWrapper>
  );
};

export default TimelineItem;
