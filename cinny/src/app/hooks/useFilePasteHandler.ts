import { useCallback, ClipboardEventHandler } from 'react';
import { getDataTransferFiles, getDataTransferUriFiles } from '../utils/dom';

export const useFilePasteHandler = (onPaste: (file: File[]) => void): ClipboardEventHandler =>
  useCallback(
    (evt) => {
      const files = getDataTransferFiles(evt.clipboardData);
      if (files) {
        onPaste(files);
        return;
      }
      if (evt.clipboardData.getData('text/uri-list').includes('file://')) {
        // keep the editor from pasting the file:// text as well
        evt.preventDefault();
        getDataTransferUriFiles(evt.clipboardData).then((uriFiles) => {
          if (uriFiles) onPaste(uriFiles);
        });
      }
    },
    [onPaste]
  );
