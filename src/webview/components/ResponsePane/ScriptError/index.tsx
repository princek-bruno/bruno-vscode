import React, { useState } from 'react';
import { IconX, IconChevronDown, IconChevronRight } from '@tabler/icons';
import type { ScriptErrorContext, ScriptErrorPhase } from '@bruno-types';
import { SCRIPT_ERROR_PHASES, getScriptError } from '@bruno-types';
import ErrorBanner from 'ui/ErrorBanner';
import CodeSnippet from 'ui/CodeSnippet';
import { getTreePathFromCollectionToItem } from 'utils/collections';
import { normalizePath } from 'utils/common/path';
import StyledWrapper from './StyledWrapper';

interface ScriptErrorProps {
  item?: Record<string, unknown>;
  collection?: Record<string, unknown>;
  onClose?: () => void;
}

interface ScriptErrorCardProps {
  title: string;
  message: string;
  errorContext: ScriptErrorContext;
  item?: Record<string, unknown>;
  collection?: Record<string, unknown>;
  onClose?: () => void;
}

const PHASE_TITLES: Record<ScriptErrorPhase, string> = {
  preRequest: 'Pre-Request Script Error',
  postResponse: 'Post-Response Script Error',
  test: 'Test Script Error'
};

/** "echo json.bru" -> Request, "auth/folder.bru" -> "Folder: auth", "collection.bru" -> Collection.
 *  An unmatched folder falls back to a bare "Folder". */
const getErrorSourceLabel = (
  filePath: string,
  item?: Record<string, unknown>,
  collection?: Record<string, unknown>
): string => {
  const normalizedPath = normalizePath(filePath);

  // Before the collection case, so folder.yml is not mistaken for a collection file.
  if (/(?:^|\/)folder\.(?:bru|yml)$/.test(normalizedPath)) {
    const folderFileName = normalizedPath.split('/').pop();
    const collectionPathname = normalizePath((collection?.pathname as string) || '');
    const treePath = collection && item ? getTreePathFromCollectionToItem(collection, item) : null;

    for (const node of treePath || []) {
      if (node?.type !== 'folder') continue;

      const nodePath = normalizePath(node.pathname || '');
      const folderRelPath = nodePath && nodePath.startsWith(collectionPathname)
        ? `${nodePath.slice(collectionPathname.length).replace(/^\//, '')}/${folderFileName}`
        : folderFileName;

      if (folderRelPath === normalizedPath) {
        return `Folder: ${node.name}`;
      }
    }

    return 'Folder';
  }

  if (normalizedPath === 'collection.bru' || /^opencollection\.ya?ml$/.test(normalizedPath)) {
    return 'Collection';
  }

  return 'Request';
};

const ScriptErrorCard = ({ title, message, errorContext, item, collection, onClose }: ScriptErrorCardProps) => {
  const [showStack, setShowStack] = useState(false);

  const filePath = errorContext.filePath ? normalizePath(errorContext.filePath) : null;

  return (
    <div className="script-error-card" data-testid="script-error-card">
      <div className="script-error-header">
        <div className="error-title" data-testid="script-error-title">{title}</div>
        {onClose && (
          <button className="close-button" data-testid="script-error-close" onClick={onClose} aria-label="Close error">
            <IconX size={16} strokeWidth={1.5} />
          </button>
        )}
      </div>
      {filePath && (
        <div className="script-error-source-label" data-testid="script-error-source-label">
          <span>{getErrorSourceLabel(filePath, item, collection)}</span>
          <span className="script-error-file-path" data-testid="script-error-file-path">{filePath}</span>
        </div>
      )}
      <CodeSnippet lines={errorContext.lines} />
      <div className="script-error-message" data-testid="script-error-message">
        {errorContext.errorType || 'Error'}: {message}
      </div>
      {errorContext.stack && (
        <div>
          <button
            className="script-error-stack-toggle"
            data-testid="script-error-stack-toggle"
            onClick={() => setShowStack(!showStack)}
            aria-expanded={showStack}
            aria-label={`${showStack ? 'Hide' : 'Show'} stack trace`}
          >
            {showStack ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
            <span>{showStack ? 'Hide' : 'Show'} stack trace</span>
          </button>
          {showStack && (
            <pre className="script-error-stack" data-testid="script-error-stack">{errorContext.stack}</pre>
          )}
        </div>
      )}
    </div>
  );
};

const ScriptError = ({ item, collection, onClose }: ScriptErrorProps) => {
  const errors = SCRIPT_ERROR_PHASES
    .map(({ phase }) => ({ phase, title: PHASE_TITLES[phase], ...getScriptError(item, phase) }))
    .filter((e) => e.message);

  if (!errors.length) return null;

  if (!errors.some((e) => e.context)) {
    return <ErrorBanner errors={errors.map(({ title, message }) => ({ title, message }))} onClose={onClose} className="mt-4 mb-2" />;
  }

  return (
    <StyledWrapper className="mt-4 mb-2">
      {errors.map(({ phase, title, message, context }) => (
        context
          ? <ScriptErrorCard
              key={phase}
              title={title}
              message={message as string}
              errorContext={context}
              item={item}
              collection={collection}
              onClose={onClose}
            />
          : <ErrorBanner key={phase} errors={[{ title, message }]} onClose={onClose} />
      ))}
    </StyledWrapper>
  );
};

export default ScriptError;
