import React, { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import Button from 'ui/Button';
import { loadRequest } from 'providers/ReduxStore/slices/collections/actions';
import { ipcRenderer } from 'utils/ipc';

interface RequestNotLoadedProps {
  item: any;
  collection: any;
}

const RequestNotLoaded: React.FC<RequestNotLoadedProps> = ({ item, collection }) => {
  const dispatch = useDispatch();
  const requestedRef = useRef<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!item?.pathname || !collection?.uid) return;
    if (requestedRef.current === item.pathname) return;
    requestedRef.current = item.pathname;
    setLoadError(null);
    dispatch(loadRequest({ pathname: item.pathname, collectionUid: collection.uid }) as any).catch((error: any) =>
      setLoadError(error?.message || 'The file could not be parsed.')
    );
  }, [item?.pathname, collection?.uid, dispatch]);

  const error = item?.error?.message || loadError;

  if (!error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="text-sm text-gray-500">Loading request...</div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col items-center justify-center h-full p-8 text-center"
      data-testid="request-failed-to-load"
    >
      <div className="text-lg font-semibold mb-2">This request could not be loaded</div>
      <div className="text-sm text-gray-500">
        {item?.filename || 'The file'} could not be parsed. Open it as text to fix the syntax.
      </div>
      <div className="mt-4">
        <Button color="secondary" size="sm" onClick={() => ipcRenderer.send('open-in-text-editor')}>
          Open as text
        </Button>
      </div>
      <pre className="text-xs text-gray-400 mt-4 font-mono whitespace-pre-wrap text-left max-w-full overflow-auto">
        {error}
      </pre>
    </div>
  );
};

export default RequestNotLoaded;
