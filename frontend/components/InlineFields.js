'use client';

import { useEffect, useState } from 'react';

/**
 * Ô nhập trong bảng: giữ giá trị cục bộ khi đang gõ, chỉ gọi onCommit
 * khi rời ô (text) hoặc chọn xong (select/date) và giá trị thực sự đổi.
 */
function useDraft(value) {
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => setDraft(value ?? ''), [value]);
  return [draft, setDraft];
}

export function InlineSelect({ value, onCommit, className, children, ...rest }) {
  const [draft, setDraft] = useDraft(value);
  return (
    <select
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        if (event.target.value !== value) onCommit(event.target.value);
      }}
      className={`cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
}

export function InlineDate({ value, onCommit, className, ...rest }) {
  const [draft, setDraft] = useDraft(value);
  return (
    <input
      type="date"
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        if (event.target.value && event.target.value !== value) onCommit(event.target.value);
      }}
      className={`cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 ${className}`}
      {...rest}
    />
  );
}

export function InlineText({ value, onCommit, multiline = false, className, ...rest }) {
  const [draft, setDraft] = useDraft(value);
  const commit = () => {
    if (draft.trim() !== (value ?? '').trim()) onCommit(draft.trim());
  };
  const shared = {
    value: draft,
    onChange: (event) => setDraft(event.target.value),
    onBlur: commit,
    className: `focus:outline-none focus:ring-2 ${className}`,
    ...rest,
  };

  return multiline ? (
    <textarea rows={2} {...shared} />
  ) : (
    <input
      type="text"
      {...shared}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}
