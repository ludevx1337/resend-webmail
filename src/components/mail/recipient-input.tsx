"use client";

import { Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type ContactSuggestion = {
  email: string;
  name: string;
  timesSeen: number;
  isFavorite: boolean;
};

type RecipientInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  trailing?: React.ReactNode;
};

function currentToken(value: string) {
  return value.split(/[;,]/).pop()?.trim() || "";
}

function replaceLastToken(value: string, replacement: string) {
  const separatorIndex = Math.max(value.lastIndexOf(","), value.lastIndexOf(";"));
  if (separatorIndex < 0) return replacement;
  const prefix = value.slice(0, separatorIndex + 1);
  return `${prefix} ${replacement}`;
}

export function RecipientInput({ label, value, onChange, required, trailing }: RecipientInputProps) {
  const [suggestions, setSuggestions] = useState<ContactSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const token = useMemo(() => currentToken(value), [value]);

  useEffect(() => {
    if (!open || !window.maildesk) return;
    const timer = window.setTimeout(() => {
      void window.maildesk?.searchContacts(token, 8)
        .then((items) => {
          setSuggestions(items as ContactSuggestion[]);
          setActiveIndex(0);
        })
        .catch(() => setSuggestions([]));
    }, 120);
    return () => window.clearTimeout(timer);
  }, [open, token]);

  function choose(contact: ContactSuggestion) {
    const replacement = contact.name ? `${contact.name} <${contact.email}>` : contact.email;
    onChange(replaceLastToken(value, replacement));
    setOpen(false);
  }

  return (
    <div className="compose-field recipient-field">
      <span>{label}</span>
      <div className="recipient-input-wrap">
        <input
          required={required}
          value={value}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (!open || suggestions.length === 0) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((index) => Math.min(index + 1, suggestions.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((index) => Math.max(index - 1, 0));
            } else if (event.key === "Enter" && suggestions[activeIndex]) {
              event.preventDefault();
              choose(suggestions[activeIndex]);
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        {open && suggestions.length > 0 && (
          <div className="recipient-suggestions">
            {suggestions.map((contact, index) => (
              <button
                key={contact.email}
                type="button"
                className={index === activeIndex ? "active" : ""}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(contact)}
              >
                <span className="contact-avatar">{(contact.name || contact.email).slice(0, 2).toUpperCase()}</span>
                <span className="contact-suggestion-text">
                  <strong>{contact.name || contact.email}</strong>
                  <small>{contact.email}</small>
                </span>
                {contact.isFavorite && <Star size={13} fill="currentColor" />}
              </button>
            ))}
          </div>
        )}
      </div>
      {trailing}
    </div>
  );
}
