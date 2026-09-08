import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const downloadInBrowser = (content: string, filename: string) => {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  let isAttached = false;

  try {
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    isAttached = true;
    anchor.click();
  } finally {
    if (isAttached) {
      document.body.removeChild(anchor);
    }
    URL.revokeObjectURL(url);
  }
};

export const exportJSONFile = async (content: string, filename: string): Promise<void> => {
  if (!Capacitor.isNativePlatform()) {
    downloadInBrowser(content, filename);
    return;
  }

  await Filesystem.writeFile({
    path: filename,
    data: content,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
    recursive: true,
  });

  const file = await Filesystem.getUri({
    path: filename,
    directory: Directory.Cache,
  });

  try {
    await Share.share({
      title: filename,
      files: [file.uri],
      dialogTitle: filename,
    });
  } finally {
    await Filesystem.deleteFile({
      path: filename,
      directory: Directory.Cache,
    }).catch(() => undefined);
  }
};
