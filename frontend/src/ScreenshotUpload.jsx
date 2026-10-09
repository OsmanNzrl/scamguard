import { useEffect, useRef, useState } from "react";
import Tesseract from "tesseract.js";
import "./ScreenshotUpload.css";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_FILES = 10;
const MIN_TEXT_LENGTH = 3;

function ScreenshotUpload({
  onTextExtracted,
  onError,
  onStart,
  onBusyChange,
  onRemove,
  onSubmit,
  disabled = false,
}) {
  const [files, setFiles] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [message, setMessage] = useState("");

  const inputRef = useRef(null);
  const itemsRef = useRef([]);
  const nextId = useRef(1);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      clearFiles();
    };
  }, []);

  function clearFiles() {
    itemsRef.current.forEach((item) => {
      item.cancelled = true;
      if (item.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }
    });
    itemsRef.current = [];
    setFiles([]);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function updateFile(id, changes) {
    if (!mountedRef.current) return;

    setFiles((previous) =>
      previous.map((item) =>
        item.id === id ? { ...item, ...changes } : item
      )
    );
  }

  async function runOcr(file, item) {
    const options = {
      logger: (info) => {
        if (
          !item.cancelled &&
          mountedRef.current &&
          info.status === "recognizing text"
        ) {
          updateFile(item.id, {
            progress: Math.round((info.progress || 0) * 100),
          });
        }
      },
    };

    try {
      return await Tesseract.recognize(file, "aze+eng", options);
    } catch (error) {
      if (item.cancelled) throw error;
      console.warn("Azerbaijani OCR failed; trying English OCR.");
      return Tesseract.recognize(file, "eng", options);
    }
  }

  async function processFile(file, item) {
    try {
      const { data } = await runOcr(file, item);

      if (item.cancelled || !mountedRef.current) return;

      const text = (data?.text || "")
        .replace(/\s+\n/g, "\n")
        .trim();

      if (text.length < MIN_TEXT_LENGTH) {
        const error =
          "Şəkildə oxuna bilən mətn tapılmadı. Daha aydın screenshot seçin.";

        updateFile(item.id, {
          status: "error",
          error,
          processing: false,
        });

        onError?.(error, item.id, file.name);
        return;
      }

      updateFile(item.id, {
        status: "done",
        progress: 100,
        processing: false,
      });

      onTextExtracted?.(text, item.id, file.name);
    } catch (error) {
      if (item.cancelled || !mountedRef.current) return;

      console.error("OCR error:", error);

      const errorMessage =
        "Şəkildən mətni oxumaq mümkün olmadı. Daha aydın şəkil seçin və ya mətni əl ilə daxil edin.";

      updateFile(item.id, {
        status: "error",
        error: errorMessage,
        processing: false,
      });

      onError?.(errorMessage, item.id, file.name);
    } finally {
      if (!item.cancelled && mountedRef.current) {
        onBusyChange?.(false, item.id);
      }
    }
  }

  function addFiles(fileList) {
    if (disabled) return;

    const selected = Array.from(fileList || []);
    if (selected.length === 0) return;

    const current = itemsRef.current;
    const newItems = [];

    for (const file of selected) {
      if (current.length + newItems.length >= MAX_FILES) {
        onError?.(`Ən çox ${MAX_FILES} şəkil əlavə edə bilərsiniz.`);
        break;
      }

      if (
        !["image/png", "image/jpeg", "image/webp"].includes(file.type)
      ) {
        onError?.(`${file.name}: PNG, JPG və ya WEBP şəkli seçin.`);
        continue;
      }

      if (file.size > MAX_FILE_SIZE) {
        onError?.(`${file.name}: şəkil 10 MB-dan kiçik olmalıdır.`);
        continue;
      }

      const duplicate = [...current, ...newItems].some(
        (item) =>
          item.file.name === file.name &&
          item.file.size === file.size &&
          item.file.lastModified === file.lastModified
      );

      if (duplicate) continue;

      newItems.push({
        id: nextId.current++,
        file,
        previewUrl: URL.createObjectURL(file),
        progress: 0,
        processing: true,
        status: "reading",
        error: "",
        cancelled: false,
      });
    }

    if (newItems.length > 0) {
      const updatedItems = [...current, ...newItems];

      itemsRef.current = updatedItems;
      setFiles(updatedItems);

      newItems.forEach((item) => {
        onStart?.(item.id, item.file.name);
        onBusyChange?.(true, item.id);
        processFile(item.file, item);
      });
    }

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function removeFile(id) {
    const item = itemsRef.current.find((entry) => entry.id === id);
    if (!item) return;

    item.cancelled = true;

    if (item.previewUrl) {
      URL.revokeObjectURL(item.previewUrl);
    }

    itemsRef.current = itemsRef.current.filter(
      (entry) => entry.id !== id
    );

    setFiles(itemsRef.current);

    onBusyChange?.(false, id);
    onRemove?.(id, item.file.name);
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragOver(false);

    if (!disabled) {
      addFiles(event.dataTransfer.files);
    }
  }

  // Yazı daxil edilərkən şəkilləri silirik, yazını saxlayırıq
  function handleTextChange(event) {
    setMessage(event.target.value);
    if (files.length > 0) {
      clearFiles();
    }
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (disabled) return;

    const text = message.trim();

    if (!text && files.length === 0) {
      onError?.("Mesaj yazın və ya analiz üçün şəkil əlavə edin.");
      return;
    }

    if (text) {
      onSubmit?.(text);
      clearFiles(); // Yalnız şəkil prevyuları təmizlənir, mətn (message) silinmir
    }
  }

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <div
        className={`composer-box${dragOver ? " is-dragover" : ""}${
          disabled ? " is-disabled" : ""
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) {
            setDragOver(true);
          }
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setDragOver(false);
          }
        }}
        onDrop={handleDrop}
      >
        {files.length > 0 && (
          <div
            className="composer-attachments"
            aria-label="Əlavə edilmiş şəkillər"
          >
            {files.map((item, index) => (
              <div className="composer-thumbnail" key={item.id}>
                <img
                  src={item.previewUrl}
                  alt={`Əlavə edilmiş şəkil ${index + 1}`}
                />

                {item.status === "reading" && (
                  <span
                    className="thumbnail-status"
                    title={`OCR ${item.progress}%`}
                  >
                    {item.progress}%
                  </span>
                )}

                {item.status === "done" && (
                  <span
                    className="thumbnail-status is-done"
                    title="Mətn oxundu"
                    aria-label="Mətn oxundu"
                  >
                    ✓
                  </span>
                )}

                {item.status === "error" && (
                  <span
                    className="thumbnail-status is-error"
                    title={item.error}
                    aria-label="Mətni oxumaq mümkün olmadı"
                  >
                    !
                  </span>
                )}

                <button
                  type="button"
                  className="thumbnail-remove"
                  onClick={() => removeFile(item.id)}
                  disabled={disabled}
                  aria-label={`Şəkil ${index + 1} silinsin`}
                  title="Şəkli sil"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <textarea
          className="composer-textarea"
          value={message}
          onChange={handleTextChange}
          placeholder="Mesajını bura yaz və ya screenshot əlavə et..."
          rows={2}
          maxLength={10000}
          disabled={disabled}
          aria-label="Analiz ediləcək mesaj"
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />

        <div className="composer-toolbar">
          <div className="composer-tools">
            <button
              type="button"
              className="composer-icon-button"
              onClick={() => inputRef.current?.click()}
              disabled={disabled || files.length >= MAX_FILES}
              aria-label="Şəkil əlavə et"
              title="Şəkil əlavə et"
            >
              +
            </button>

            <span className="composer-hint">
              {files.length > 0
                ? `${files.length}/${MAX_FILES} şəkil`
                : "PNG, JPG, WEBP · Maksimum 10 MB"}
            </span>

            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              disabled={disabled || files.length >= MAX_FILES}
              className="composer-file-input"
              onChange={(event) => addFiles(event.target.files)}
            />
          </div>

          <button
            type="submit"
            className="composer-submit"
            disabled={
              disabled ||
              (!message.trim() && files.length === 0)
            }
          >
            Analiz et <span aria-hidden="true">↑</span>
          </button>
        </div>
      </div>

      {files.some((item) => item.status === "error") && (
        <p className="composer-error" role="status">
          Bəzi şəkillərdən mətn oxunmadı. Şəkli silib yenidən əlavə edə
          və ya mesajı əl ilə yaza bilərsiniz.
        </p>
      )}
    </form>
  );
}

export default ScreenshotUpload;