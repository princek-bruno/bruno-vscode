import React from 'react';
import StyledWrapper from './StyledWrapper';
import TimelineItem from './TimelineItem/index';
import GrpcTimelineItem from './GrpcTimelineItem/index';
import { useItemTimeline } from '../timeline-utils';

const Timeline = ({
  collection,
  item
}: any) => {
  const isGrpcRequest = item.type === 'grpc-request' || item.type === 'ws-request';
  const combinedTimeline = useItemTimeline(collection, item);

  return (
    <StyledWrapper
      className="pb-4 w-full flex flex-grow flex-col"
    >
      <div
        className="timeline-container"
        data-testid="timeline-container"
      >
        {combinedTimeline.map((event, index) => {
          // Newest-first: an index key would let a new row inherit the top row's expand state.
          const key = event.id ?? `${event.type}-${event.itemUid}-${event.timestamp}-${event.eventType ?? ''}-${index}`;
          if (event.type === 'request') {
            const { data, timestamp, eventType } = event;
            const { request, response, eventData = {}, timestamp: eventTimestamp = timestamp } = data;

            if (isGrpcRequest) {
              return (
                <div key={key} className="timeline-event" data-testid="timeline-item">
                  <GrpcTimelineItem
                    timestamp={eventTimestamp}
                    request={request}
                    response={response}
                    eventType={eventType}
                    eventData={eventData}
                    item={item}
                    collection={collection}
                  />
                </div>
              );
            }

            return (
              <div key={key} className="timeline-event" data-testid="timeline-item">
                <TimelineItem
                  timestamp={timestamp}
                  request={request}
                  response={response}
                  item={item}
                  collection={collection}
                />
              </div>
            );
          } else if (event.type === 'oauth2') { // Handle OAuth2 events
            const { data, timestamp } = event;
            const { debugInfo } = data;
            return (
              <div key={key} className="timeline-event" data-testid="timeline-item">
                <div className="timeline-event-header cursor-pointer flex items-center">
                  <div className="flex items-center">
                    <span className="font-bold">OAuth2.0 Calls</span>
                  </div>
                </div>
                <div className="mt-2">
                  {debugInfo && debugInfo.length > 0 ? (
                    debugInfo.map((data: any, idx: any) => (
                      <div className="ml-4" key={idx}>
                        <TimelineItem
                          timestamp={timestamp}
                          request={data?.request}
                          response={data?.response}
                          item={item}
                          collection={collection}
                          isOauth2={true}
                        />
                      </div>
                    ))
                  ) : (
                    <div>No debug information available.</div>
                  )}
                </div>
              </div>
            );
          }

          return null;
        })}
      </div>
    </StyledWrapper>
  );
};

export default Timeline;
