import { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus, Trash2, ChevronLeft, ChevronRight, X, Check, Calendar as CalendarIcon,
  Settings, User, Car, Clock, MapPin, LogOut, Share2, Copy, CheckCheck,
} from "lucide-react";
import { api, getStoredAdminToken, storeAdminToken, clearStoredAdminToken } from "./api";
import {
  dateKey, formatDayLabel, toHHMM, toMinutes, formatClock,
  MIN_BOOKING_LENGTH, SERVICES, serviceFor, loadColor,
} from "./helpers";

export default function App() {
  const [mode, setMode] = useState("customer"); // "customer" | "admin"
  const [adminToken, setAdminToken] = useState(() => getStoredAdminToken());
  const [passwordPromptOpen, setPasswordPromptOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);

  const [current, setCurrent] = useState(() => new Date());
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [calendarExpanded, setCalendarExpanded] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.innerWidth > 640;
  });

  const [dayData, setDayData] = useState(null); // { window, bookings, fromOptions }
  const [dayLoading, setDayLoading] = useState(true);
  const [dayError, setDayError] = useState("");

  const [calendarDays, setCalendarDays] = useState({}); // { "YYYY-MM-DD": fraction | null }
  const [calendarLoading, setCalendarLoading] = useState(false);

  const [branding, setBranding] = useState({ name: "Riverside Detailing", logo: null });

  const [fromMinute, setFromMinute] = useState(null);
  const [toMinute, setToMinute] = useState(null);
  const [toOptions, setToOptions] = useState([]);
  const [toOptionsLoading, setToOptionsLoading] = useState(false);

  const [bookingFormOpen, setBookingFormOpen] = useState(false);
  const [bookingForm, setBookingForm] = useState({ name: "", phone: "", email: "", address: "", notes: "" });
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [bookingSubmitError, setBookingSubmitError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState("");
  const [confirmedBooking, setConfirmedBooking] = useState(null);

  const [windowForm, setWindowForm] = useState({ window_start: "08:00", window_end: "17:00", interval_minutes: 60, service_id: "detailing" });
  const [windowSaving, setWindowSaving] = useState(false);
  const [windowSaved, setWindowSaved] = useState(false);
  const [windowSaveError, setWindowSaveError] = useState("");

  const key = dateKey(current);

  // ---- load branding once on mount (public, no auth needed) ----
  useEffect(() => {
    api.getBranding().then(setBranding).catch(() => {
      // keep default branding on failure — non-critical
    });
  }, []);

  // ---- load the current day's data whenever the date changes ----
  const loadDay = useCallback(async () => {
    setDayLoading(true);
    setDayError("");
    try {
      const data = await api.getDay(key);
      setDayData(data);
      setWindowForm({
        window_start: data.window.window_start,
        window_end: data.window.window_end,
        interval_minutes: data.window.interval_minutes,
        service_id: data.window.service_id || "detailing",
      });
    } catch (e) {
      setDayError(e.message || "Couldn't load this day. Please try again.");
      setDayData(null);
    } finally {
      setDayLoading(false);
    }
  }, [key]);

  useEffect(() => {
    loadDay();
    setFromMinute(null);
    setToMinute(null);
    setToOptions([]);
  }, [loadDay]);

  // ---- load calendar month data whenever the visible month changes ----
  const loadCalendarMonth = useCallback(async () => {
    setCalendarLoading(true);
    try {
      const data = await api.getCalendarMonth(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1);
      setCalendarDays(data.days || {});
    } catch (e) {
      setCalendarDays({});
    } finally {
      setCalendarLoading(false);
    }
  }, [visibleMonth]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCalendarLoading(true);
      try {
        const data = await api.getCalendarMonth(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1);
        if (!cancelled) setCalendarDays(data.days || {});
      } catch (e) {
        if (!cancelled) setCalendarDays({});
      } finally {
        if (!cancelled) setCalendarLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visibleMonth]);

  // ---- fetch "to" options whenever "from" changes ----
  useEffect(() => {
    if (fromMinute === null) {
      setToOptions([]);
      return;
    }
    let cancelled = false;
    setToOptionsLoading(true);
    api
      .getToOptions(key, fromMinute)
      .then((data) => {
        if (!cancelled) setToOptions(data.toOptions || []);
      })
      .catch(() => {
        if (!cancelled) setToOptions([]);
      })
      .finally(() => {
        if (!cancelled) setToOptionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [key, fromMinute]);

  function shiftDay(delta) {
    setCurrent((d) => {
      const nd = new Date(d);
      nd.setDate(nd.getDate() + delta);
      setVisibleMonth(new Date(nd.getFullYear(), nd.getMonth(), 1));
      return nd;
    });
  }
  function goToday() {
    const t = new Date();
    setCurrent(t);
    setVisibleMonth(new Date(t.getFullYear(), t.getMonth(), 1));
  }
  function selectDate(d) {
    setCurrent(d);
  }

  function handleFromChange(val) {
    setFromMinute(val === "" ? null : Number(val));
    setToMinute(null);
  }
  function handleToChange(val) {
    setToMinute(val === "" ? null : Number(val));
  }

  // ---- customer booking flow ----
  // ---- booking form validation ----
  function validatePhone(value) {
    if (!value.trim()) return ""; // empty is ok — the "at least one" check handles it
    const digits = value.replace(/\D/g, "");
    if (digits.length < 7) return "Phone number is too short (at least 7 digits).";
    if (digits.length > 15) return "Phone number is too long (max 15 digits).";
    return "";
  }

  function validateEmail(value) {
    if (!value.trim()) return ""; // empty is ok — the "at least one" check handles it
    // Standard email regex: something@something.something
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!emailRe.test(value.trim())) return "Please enter a valid email address (e.g. name@example.com).";
    return "";
  }

  function openBookingForm() {
    setBookingForm({ name: "", phone: "", email: "", address: "", notes: "" });
    setBookingSubmitError("");
    setPhoneError("");
    setEmailError("");
    setLocateError("");
    setBookingFormOpen(true);
  }

  async function submitBooking() {
    if (fromMinute === null || toMinute === null) return;
    const name = bookingForm.name.trim();
    if (!name) return;
    if (!bookingForm.phone.trim() && !bookingForm.email.trim()) return;

    // Run validation once more on submit in case the user never blurred the fields
    const pErr = validatePhone(bookingForm.phone);
    const eErr = validateEmail(bookingForm.email);
    setPhoneError(pErr);
    setEmailError(eErr);
    if (pErr || eErr) return;

    setBookingSubmitting(true);
    setBookingSubmitError("");
    try {
      const result = await api.createBooking({
        date: key,
        start: toHHMM(fromMinute),
        end: toHHMM(toMinute),
        name,
        phone: bookingForm.phone.trim(),
        email: bookingForm.email.trim(),
        address: bookingForm.address.trim(),
        notes: bookingForm.notes.trim(),
      });
      setConfirmedBooking(result.booking);
      setBookingFormOpen(false);
      setFromMinute(null);
      setToMinute(null);
      await loadDay(); // refresh so the just-booked slot disappears from availability
    } catch (e) {
      // A 409 here specifically means someone else booked this exact slot in the
      // gap between the user opening the form and submitting — a real race the
      // server catches that the client alone never could. Surface it clearly and
      // refresh availability so they can pick a different time.
      setBookingSubmitError(e.message || "Couldn't complete the booking. Please try again.");
      if (e.status === 409) {
        await loadDay();
        setFromMinute(null);
        setToMinute(null);
      }
    } finally {
      setBookingSubmitting(false);
    }
  }

  function handleUseLocation() {
    setLocateError("");
    if (!navigator.geolocation) {
      setLocateError("Location isn't available in this browser.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const resp = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
            { headers: { Accept: "application/json" } }
          );
          if (!resp.ok) throw new Error("lookup failed");
          const data = await resp.json();
          if (data?.display_name) {
            setBookingForm((f) => ({ ...f, address: data.display_name }));
          } else {
            throw new Error("no address in response");
          }
        } catch (e) {
          setBookingForm((f) => ({ ...f, address: `Lat ${latitude.toFixed(5)}, Lon ${longitude.toFixed(5)}` }));
          setLocateError("Couldn't look up the street address, so we filled in your coordinates instead — feel free to edit.");
        } finally {
          setLocating(false);
        }
      },
      (err) => {
        setLocating(false);
        setLocateError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission was denied. You can still type your address manually."
            : "Couldn't get your location. You can still type your address manually."
        );
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  // ---- admin auth ----
  function handleModeToggleClick() {
    if (mode === "admin") {
      // Leaving admin always clears the token, so coming back in — even later
      // in the same page session — requires the password again. This is a
      // deliberate requirement: admin access should never be "remembered."
      setAdminToken(null);
      clearStoredAdminToken();
      setMode("customer");
      return;
    }
    setPasswordInput("");
    setPasswordError("");
    setPasswordPromptOpen(true);
  }

  async function submitPasswordPrompt() {
    setLoggingIn(true);
    setPasswordError("");
    try {
      const result = await api.adminLogin(passwordInput);
      setAdminToken(result.token);
      storeAdminToken(result.token);
      setPasswordPromptOpen(false);
      setPasswordInput("");
      setMode("admin");
    } catch (e) {
      setPasswordError(e.message || "That password isn't right.");
    } finally {
      setLoggingIn(false);
    }
  }

  function handleAdminLogout() {
    setAdminToken(null);
    clearStoredAdminToken();
    setMode("customer");
  }

  // If a stored token is invalid/expired (e.g. server restarted with a new random
  // JWT_SECRET — see server .env.example), any admin action will 401. Catch that
  // globally by clearing the token and bouncing back to customer view with a fresh
  // login prompt, rather than silently failing.
  function handleAdminAuthFailure() {
    setAdminToken(null);
    clearStoredAdminToken();
    setMode("customer");
    setPasswordError("Your admin session expired. Please log in again.");
    setPasswordPromptOpen(true);
  }

  // ---- admin: availability window ----
  async function handleSaveWindow() {
    setWindowSaving(true);
    setWindowSaveError("");
    try {
      await api.adminSetWindow(key, windowForm, adminToken);
      setWindowSaved(true);
      setTimeout(() => setWindowSaved(false), 2000);
      await loadDay();
    } catch (e) {
      if (e.status === 401) {
        handleAdminAuthFailure();
      } else {
        setWindowSaveError(e.message || "Couldn't save — please try again.");
      }
    } finally {
      setWindowSaving(false);
    }
  }

  async function handleDeleteBooking(id) {
    try {
      await api.adminDeleteBooking(id, adminToken);
      await loadDay();
    } catch (e) {
      if (e.status === 401) handleAdminAuthFailure();
    }
  }

  return (
    <div style={{ fontFamily: "'Inter', ui-sans-serif, -apple-system, 'Segoe UI', Roboto, sans-serif", background: "#F5F3EE", color: "#1A2B3D", minHeight: "100vh", position: "relative" }}>
      <style>{`
        * { box-sizing: border-box; }
        .bk-input { font-family: inherit; border: 1px solid #D7D2C5; border-radius: 8px; padding: 10px 12px; font-size: 15px; background: #fff; color: #1A2B3D; width: 100%; min-width: 0; max-width: 100%; box-sizing: border-box; }
        .bk-input:focus { outline: none; border-color: #1A2B3D; box-shadow: 0 0 0 2px rgba(26,43,61,0.12); }
        .bk-input:disabled { background: #F0EDE3; color: #A8A39A; cursor: not-allowed; }
        .bk-primary { background: #E8702A; color: #fff; border: none; border-radius: 10px; padding: 13px 20px; font-size: 15px; font-weight: 700; cursor: pointer; }
        .bk-primary:hover { background: #d4631f; }
        .bk-primary:disabled { background: #D7D2C5; cursor: not-allowed; }
        .bk-ghost { background: transparent; color: #1A2B3D; border: 1px solid #D7D2C5; border-radius: 10px; padding: 13px 20px; font-size: 15px; font-weight: 600; cursor: pointer; }
        .bk-ghost:hover { background: #EAE7DD; }
        .bk-icon-btn { display: flex; align-items: center; justify-content: center; border: none; background: transparent; cursor: pointer; border-radius: 8px; color: #6b6657; padding: 8px; }
        .bk-icon-btn:hover { background: rgba(0,0,0,0.06); }
        /* Flex items default to min-width:auto, which lets native date/time inputs
           (whose intrinsic content width includes their built-in picker UI) force
           their column wider than intended — breaking alignment with sibling fields
           and overflowing the panel on mobile Safari specifically. min-width:0 lets
           them actually shrink to the flex-basis like every other field does.
           The columns themselves also now use flex:1 1 0 (equal distribution,
           ignoring each field's natural content size) rather than mismatched
           flex-basis pixel values, since WebKit's native time/date control can
           still assert its own intrinsic width against a content-derived basis
           even with min-width:0 in place — flex-basis:0 removes that fight
           entirely by never deriving a starting size from content at all. */
        .gen-row > div { min-width: 0; }
        .gen-row input[type="date"],
        .gen-row input[type="time"] {
          width: 100%; min-width: 0; max-width: 100%; box-sizing: border-box;
          -webkit-appearance: none; appearance: none;
        }
        @media (max-width: 640px) {
          .from-to-row { flex-direction: column !important; }
          .gen-row { flex-direction: column !important; }
          .calendar-layout { flex-direction: column !important; }
          .calendar-col { width: 100% !important; max-width: 100%; }
          .calendar-toggle-btn { display: flex !important; }
          .calendar-col-collapsed { display: none !important; }
        }
        @media (max-width: 380px) { .mode-label { display: none; } }
        @keyframes pinPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
        .pin-pulse { animation: pinPulse 1s ease-in-out infinite; }

        .modal-overlay { height: 100vh; }
        .modal-box { max-height: calc(100vh - 32px); }
        @supports (height: 100dvh) {
          .modal-overlay { height: 100dvh; }
          .modal-box { max-height: calc(100dvh - 32px); }
        }

        /* Adds the device's actual bottom safe-area inset (e.g. Safari's floating
           toolbar / home indicator area on iPhone) on top of the base padding, so
           buttons and content at the bottom of the page are never rendered behind
           browser UI. env() resolves to 0 on browsers that don't support it, so
           this is a no-op fallback rather than breaking anything. */
        .page-container {
          padding: 24px 20px calc(80px + env(safe-area-inset-bottom, 0px));
        }
      `}</style>

      <div style={{ borderBottom: "1px solid #E3DECF", background: "#1A2B3D" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "10px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#fff" }}>
            {branding.logo ? (
              <img src={branding.logo} alt={branding.name} style={{ width: 44, height: 44, borderRadius: "50%", flexShrink: 0, display: "block", objectFit: "cover" }} />
            ) : (
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#E8702A", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Car size={20} color="#fff" />
              </div>
            )}
            <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: "0.01em" }}>{branding.name}</span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={() => setShareModalOpen(true)}
              className="bk-icon-btn"
              style={{ color: "#fff" }}
              aria-label="Share this site"
              title="Share"
            >
              <Share2 size={16} />
            </button>
            {mode === "admin" && (
              <button onClick={handleAdminLogout} className="bk-icon-btn" style={{ color: "#fff" }} aria-label="Log out" title="Log out">
                <LogOut size={16} />
              </button>
            )}
            <button
              onClick={handleModeToggleClick}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}
            >
              {mode === "customer" ? <Settings size={15} /> : <User size={15} />}
              <span className="mode-label">{mode === "customer" ? "Admin view" : "Customer view"}</span>
            </button>
          </div>
        </div>
      </div>

      {mode === "customer" ? (
        <CustomerView
          current={current} shiftDay={shiftDay} goToday={goToday}
          dayData={dayData} dayLoading={dayLoading} dayError={dayError}
          fromMinute={fromMinute} toMinute={toMinute} toOptions={toOptions} toOptionsLoading={toOptionsLoading}
          onFromChange={handleFromChange} onToChange={handleToChange} openBookingForm={openBookingForm}
          visibleMonth={visibleMonth} setVisibleMonth={setVisibleMonth} selectDate={selectDate}
          calendarDays={calendarDays} calendarExpanded={calendarExpanded} setCalendarExpanded={setCalendarExpanded}
        />
      ) : (
        <AdminView
          current={current} shiftDay={shiftDay} goToday={goToday}
          windowForm={windowForm} setWindowForm={setWindowForm} handleSaveWindow={handleSaveWindow}
          windowSaving={windowSaving} windowSaved={windowSaved} windowSaveError={windowSaveError}
          dayData={dayData} dayLoading={dayLoading} onDeleteBooking={handleDeleteBooking}
          visibleMonth={visibleMonth} setVisibleMonth={setVisibleMonth} selectDate={selectDate}
          calendarDays={calendarDays} calendarExpanded={calendarExpanded} setCalendarExpanded={setCalendarExpanded}
          branding={branding} setBranding={setBranding} adminToken={adminToken} onAuthFailure={handleAdminAuthFailure}
          loadCalendarMonth={loadCalendarMonth} loadDay={loadDay}
        />
      )}

      {bookingFormOpen && dayData && (
        <Modal onClose={() => !bookingSubmitting && setBookingFormOpen(false)}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Confirm your appointment</h2>
            <button className="bk-icon-btn" onClick={() => setBookingFormOpen(false)} aria-label="Close" disabled={bookingSubmitting}>
              <X size={18} />
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, padding: "10px 12px", background: "#F5F3EE", borderRadius: 8 }}>
            <Car size={18} style={{ color: serviceFor(dayData.window.service_id).color }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{serviceFor(dayData.window.service_id).label}</div>
              <div style={{ fontSize: 13, color: "#6b6657" }}>
                {formatDayLabel(current)} · {formatClock(toHHMM(fromMinute))}–{formatClock(toHHMM(toMinute))}
              </div>
            </div>
          </div>
          <p style={{ fontSize: 12, color: "#6b6657", margin: "0 0 16px", lineHeight: 1.5 }}>
            This reserves your spot on the schedule. We'll reach out by phone or email to confirm the details before your appointment.
          </p>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#6b6657", display: "block", marginBottom: 4 }}>Your name</label>
          <input className="bk-input" placeholder="Jane Smith" value={bookingForm.name} onChange={(e) => setBookingForm({ ...bookingForm, name: e.target.value })} style={{ marginBottom: 12 }} autoFocus disabled={bookingSubmitting} />
          <label style={{ fontSize: 12, fontWeight: 600, color: "#6b6657", display: "block", marginBottom: 4 }}>Phone</label>
          <input
            className="bk-input"
            placeholder="555-0100"
            value={bookingForm.phone}
            onChange={(e) => {
              setBookingForm({ ...bookingForm, phone: e.target.value });
              if (phoneError) setPhoneError(validatePhone(e.target.value));
            }}
            onBlur={(e) => setPhoneError(validatePhone(e.target.value))}
            style={{ marginBottom: phoneError ? 4 : 12, borderColor: phoneError ? "#A32D2D" : undefined }}
            disabled={bookingSubmitting}
          />
          {phoneError && <p style={{ fontSize: 12, color: "#A32D2D", margin: "0 0 12px" }}>{phoneError}</p>}
          <label style={{ fontSize: 12, fontWeight: 600, color: "#6b6657", display: "block", marginBottom: 4 }}>Email</label>
          <input
            type="email"
            className="bk-input"
            placeholder="jane@example.com"
            value={bookingForm.email}
            onChange={(e) => {
              setBookingForm({ ...bookingForm, email: e.target.value });
              if (emailError) setEmailError(validateEmail(e.target.value));
            }}
            onBlur={(e) => setEmailError(validateEmail(e.target.value))}
            style={{ marginBottom: emailError ? 4 : 0, borderColor: emailError ? "#A32D2D" : undefined }}
            disabled={bookingSubmitting}
          />
          {emailError && <p style={{ fontSize: 12, color: "#A32D2D", margin: "0 0 4px" }}>{emailError}</p>}
          <p style={{ fontSize: 11, color: "#8B8680", margin: "0 0 12px" }}>We'll send your confirmation to whichever of phone or email you provide.</p>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#6b6657", display: "block", marginBottom: 4 }}>Location</label>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 4 }}>
            <input className="bk-input" placeholder="123 Maple St, Springfield" value={bookingForm.address} onChange={(e) => setBookingForm({ ...bookingForm, address: e.target.value })} disabled={bookingSubmitting} />
            <button type="button" onClick={handleUseLocation} disabled={locating || bookingSubmitting} title="Use my current location" aria-label="Use my current location"
              style={{ flexShrink: 0, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, border: "1px solid #D7D2C5", background: locating ? "#EAE7DD" : "#fff", color: "#E8702A", cursor: locating ? "default" : "pointer" }}>
              <MapPin size={18} className={locating ? "pin-pulse" : ""} />
            </button>
          </div>
          {locateError ? (
            <p style={{ fontSize: 12, color: "#B5762E", margin: "0 0 12px" }}>{locateError}</p>
          ) : (
            <p style={{ fontSize: 11, color: "#8B8680", margin: "0 0 12px" }}>Tap the pin to fill this in from your phone's location — we'll ask permission first.</p>
          )}
          <label style={{ fontSize: 12, fontWeight: 600, color: "#6b6657", display: "block", marginBottom: 4 }}>Notes (optional)</label>
          <input className="bk-input" placeholder="Gate code, driveway details, etc." value={bookingForm.notes} onChange={(e) => setBookingForm({ ...bookingForm, notes: e.target.value })} style={{ marginBottom: 18 }} disabled={bookingSubmitting} />

          {bookingSubmitError && (
            <p style={{ fontSize: 12, color: "#A32D2D", margin: "0 0 12px" }}>{bookingSubmitError}</p>
          )}
          {bookingForm.name.trim() && !bookingForm.phone.trim() && !bookingForm.email.trim() && (
            <p style={{ fontSize: 12, color: "#B5762E", margin: "0 0 10px" }}>Please add a phone number or email so we can send your confirmation.</p>
          )}
          <button className="bk-primary" style={{ width: "100%" }}
            disabled={!bookingForm.name.trim() || (!bookingForm.phone.trim() && !bookingForm.email.trim()) || !!phoneError || !!emailError || bookingSubmitting}
            onClick={submitBooking}>
            {bookingSubmitting ? "Booking…" : "Confirm booking"}
          </button>
        </Modal>
      )}

      {confirmedBooking && (
        <Modal onClose={() => setConfirmedBooking(null)}>
          <div style={{ textAlign: "center", padding: "10px 0" }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#E8F0EA", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
              <Check size={24} style={{ color: "#5C8A72" }} />
            </div>
            <h2 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700 }}>You're booked</h2>
            <p style={{ margin: "0 0 8px", fontSize: 14, color: "#6b6657" }}>
              {formatDayLabel(current)}, {formatClock(confirmedBooking.start_time)}–{formatClock(confirmedBooking.end_time)}
            </p>
            <p style={{ margin: "0 0 18px", fontSize: 12, color: "#8B8680" }}>We'll be in touch by phone or email to confirm before then.</p>
            <button className="bk-primary" style={{ width: "100%" }} onClick={() => setConfirmedBooking(null)}>Done</button>
          </div>
        </Modal>
      )}

      {passwordPromptOpen && (
        <Modal onClose={() => !loggingIn && setPasswordPromptOpen(false)}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Admin sign-in</h2>
            <button className="bk-icon-btn" onClick={() => setPasswordPromptOpen(false)} aria-label="Close" disabled={loggingIn}>
              <X size={18} />
            </button>
          </div>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#6b6657", display: "block", marginBottom: 4 }}>Password</label>
          <input type="password" className="bk-input" value={passwordInput} onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(""); }}
            onKeyDown={(e) => e.key === "Enter" && submitPasswordPrompt()} autoFocus style={{ marginBottom: 8 }} disabled={loggingIn} />
          {passwordError && <p style={{ fontSize: 12, color: "#A32D2D", margin: "0 0 12px" }}>{passwordError}</p>}
          <button className="bk-primary" style={{ width: "100%", marginTop: passwordError ? 0 : 8 }} onClick={submitPasswordPrompt} disabled={loggingIn}>
            {loggingIn ? "Checking…" : "Unlock"}
          </button>
        </Modal>
      )}

      {shareModalOpen && (
        <ShareModal onClose={() => setShareModalOpen(false)} branding={branding} />
      )}
    </div>
  );
}

// ---------- share modal ----------

function ShareModal({ onClose, branding }) {
  const siteUrl = window.location.origin;
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState("");

  async function handleNativeShare() {
    setShareError("");
    if (navigator.share) {
      try {
        await navigator.share({
          title: branding.name,
          text: `Book an appointment with ${branding.name}`,
          url: siteUrl,
        });
      } catch (e) {
        // User cancelled the share sheet — this is a normal action, not an error worth displaying
        if (e.name !== "AbortError") {
          setShareError("Sharing didn't complete. You can copy the link below instead.");
        }
      }
    } else {
      // Browser doesn't support Web Share API — shouldn't reach here since we only
      // show this button when supported, but handle gracefully just in case
      setShareError("Native sharing isn't available in this browser. Copy the link below instead.");
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(siteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      // Clipboard API blocked (e.g. non-HTTPS or restricted browser) — select the
      // text in the input as a fallback so the user can copy it manually
      const input = document.getElementById("share-url-input");
      if (input) { input.select(); }
      setShareError("Couldn't copy automatically — select and copy the link above manually.");
    }
  }

  const nativeShareSupported = !!navigator.share;

  return (
    <Modal onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Share this site</h2>
        <button className="bk-icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
      </div>

      <p style={{ fontSize: 13, color: "#6b6657", margin: "0 0 16px", lineHeight: 1.5 }}>
        This will pass along the site address to a recipient so they can book an appointment. Use the button below to share via your phone's apps, or copy the link and paste it into an email, text, or message yourself.
      </p>

      <label style={{ fontSize: 12, fontWeight: 600, color: "#6b6657", display: "block", marginBottom: 6 }}>Site link</label>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          id="share-url-input"
          className="bk-input"
          readOnly
          value={siteUrl}
          onFocus={(e) => e.target.select()}
          style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13, cursor: "text" }}
        />
        <button
          onClick={handleCopy}
          title={copied ? "Copied!" : "Copy link"}
          aria-label={copied ? "Copied!" : "Copy link"}
          style={{
            flexShrink: 0, width: 42, height: 42, display: "flex", alignItems: "center",
            justifyContent: "center", borderRadius: 8, border: "1px solid #D7D2C5",
            background: copied ? "#DEEDE3" : "#fff", color: copied ? "#3D7A52" : "#1A2B3D",
            cursor: "pointer", transition: "all 0.2s",
          }}
        >
          {copied ? <CheckCheck size={17} /> : <Copy size={17} />}
        </button>
      </div>

      {copied && (
        <p style={{ fontSize: 12, color: "#5C8A72", margin: "-8px 0 12px", fontWeight: 600 }}>Link copied to clipboard!</p>
      )}

      {shareError && (
        <p style={{ fontSize: 12, color: "#B5762E", margin: "0 0 12px" }}>{shareError}</p>
      )}

      {nativeShareSupported && (
        <button className="bk-primary" onClick={handleNativeShare} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Share2 size={16} />
          Share via your apps
        </button>
      )}
      {!nativeShareSupported && (
        <p style={{ fontSize: 12, color: "#8B8680", textAlign: "center", margin: 0 }}>
          Copy the link above and paste it into an email, text message, or any app you'd like.
        </p>
      )}
    </Modal>
  );
}


// ---------- customer view ----------

function CustomerView({
  current, shiftDay, goToday, dayData, dayLoading, dayError,
  fromMinute, toMinute, toOptions, toOptionsLoading, onFromChange, onToChange, openBookingForm,
  visibleMonth, setVisibleMonth, selectDate, calendarDays, calendarExpanded, setCalendarExpanded,
}) {
  const canBook = fromMinute !== null && toMinute !== null;
  const fromOptions = dayData?.fromOptions || [];
  const isBlocked = !!dayData?.blocked;
  const noAvailability = !dayLoading && !isBlocked && fromOptions.length === 0;

  return (
    <div className="page-container" style={{ maxWidth: 980, margin: "0 auto" }}>
      <button className="calendar-toggle-btn" onClick={() => setCalendarExpanded((v) => !v)}
        style={{ display: "none", alignItems: "center", justifyContent: "space-between", width: "100%", background: "#fff", border: "1px solid #E3DECF", borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 13, fontWeight: 600, color: "#1A2B3D", cursor: "pointer" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}><CalendarIcon size={15} />{formatDayLabel(current)}</span>
        <ChevronLeft size={15} style={{ transform: calendarExpanded ? "rotate(90deg)" : "rotate(-90deg)", transition: "transform 0.15s" }} />
      </button>

      <div className="calendar-layout" style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
        <div className={`calendar-col ${calendarExpanded ? "" : "calendar-col-collapsed"}`} style={{ width: 280, flexShrink: 0 }}>
          <MonthCalendar visibleMonth={visibleMonth} setVisibleMonth={setVisibleMonth} selectedDate={current} onSelectDate={selectDate} calendarDays={calendarDays} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <DayNav current={current} shiftDay={shiftDay} goToday={goToday} />

          {dayError && (
            <p style={{ fontSize: 12, color: "#A32D2D", marginTop: 14 }}>{dayError}</p>
          )}

          <div style={{ background: "#fff", border: "1px solid #E3DECF", borderRadius: 12, padding: 20, marginTop: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <Car size={18} style={{ color: "#2F6690" }} />
              <span style={{ fontWeight: 700, fontSize: 15 }}>{dayData ? serviceFor(dayData.window.service_id).label : "Loading…"}</span>
            </div>

            {dayLoading ? (
              <p style={{ fontSize: 13, color: "#8B8680" }}>Loading available times…</p>
            ) : isBlocked ? (
              <EmptyState text="This day is out of service and isn't available for booking." />
            ) : noAvailability ? (
              <EmptyState text="No times are available for this day. Try another day." />
            ) : (
              <>
                <p style={{ fontSize: 13, color: "#6b6657", margin: "0 0 16px" }}>
                  Available between {formatClock(dayData.window.window_start)} and {formatClock(dayData.window.window_end)}. Pick a start and end time below.
                </p>
                <div className="from-to-row" style={{ display: "flex", gap: 14, marginBottom: 18 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#6b6657", display: "block", marginBottom: 6 }}>From</label>
                    <select className="bk-input" value={fromMinute === null ? "" : fromMinute} onChange={(e) => onFromChange(e.target.value)}>
                      <option value="">Select a time</option>
                      {fromOptions.map((m) => <option key={m} value={m}>{formatClock(toHHMM(m))}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#6b6657", display: "block", marginBottom: 6 }}>To</label>
                    <select className="bk-input" value={toMinute === null ? "" : toMinute} onChange={(e) => onToChange(e.target.value)} disabled={fromMinute === null || toOptionsLoading}>
                      <option value="">{fromMinute === null ? "Pick a start first" : toOptionsLoading ? "Loading…" : "Select a time"}</option>
                      {toOptions.map((m) => <option key={m} value={m}>{formatClock(toHHMM(m))}</option>)}
                    </select>
                  </div>
                </div>
                <button className="bk-primary" style={{ width: "100%" }} disabled={!canBook} onClick={openBookingForm}>
                  {canBook ? `Request ${formatClock(toHHMM(fromMinute))}–${formatClock(toHHMM(toMinute))}` : "Choose a from and to time"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- admin view ----------

function AdminView({
  current, shiftDay, goToday, windowForm, setWindowForm, handleSaveWindow, windowSaving, windowSaved, windowSaveError,
  dayData, dayLoading, onDeleteBooking,
  visibleMonth, setVisibleMonth, selectDate, calendarDays, calendarExpanded, setCalendarExpanded,
  branding, setBranding, adminToken, onAuthFailure, loadCalendarMonth, loadDay,
}) {
  const bookings = dayData?.bookings || [];

  return (
    <div className="page-container" style={{ maxWidth: 980, margin: "0 auto" }}>
      <button className="calendar-toggle-btn" onClick={() => setCalendarExpanded((v) => !v)}
        style={{ display: "none", alignItems: "center", justifyContent: "space-between", width: "100%", background: "#fff", border: "1px solid #E3DECF", borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 13, fontWeight: 600, color: "#1A2B3D", cursor: "pointer" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}><CalendarIcon size={15} />{formatDayLabel(current)}</span>
        <ChevronLeft size={15} style={{ transform: calendarExpanded ? "rotate(90deg)" : "rotate(-90deg)", transition: "transform 0.15s" }} />
      </button>

      <div className="calendar-layout" style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
        <div className={`calendar-col ${calendarExpanded ? "" : "calendar-col-collapsed"}`} style={{ width: 280, flexShrink: 0 }}>
          <MonthCalendar visibleMonth={visibleMonth} setVisibleMonth={setVisibleMonth} selectedDate={current} onSelectDate={selectDate} calendarDays={calendarDays} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <DayNav current={current} shiftDay={shiftDay} goToday={goToday} />

          <div style={{ background: "#fff", border: "1px solid #E3DECF", borderRadius: 12, padding: 16, marginTop: 18, marginBottom: 22 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "#6b6657", textTransform: "uppercase", letterSpacing: "0.04em" }}>Availability for this day</h3>
            {dayLoading ? (
              <p style={{ fontSize: 13, color: "#8B8680" }}>Loading…</p>
            ) : (
              <>
                <div className="gen-row" style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 0", minWidth: 90 }}>
                    <label style={{ fontSize: 11, color: "#8B8680", display: "block", marginBottom: 4 }}>Open from</label>
                    <input type="time" className="bk-input" value={windowForm.window_start} onChange={(e) => setWindowForm({ ...windowForm, window_start: e.target.value })} />
                  </div>
                  <div style={{ flex: "1 1 0", minWidth: 90 }}>
                    <label style={{ fontSize: 11, color: "#8B8680", display: "block", marginBottom: 4 }}>Open until</label>
                    <input type="time" className="bk-input" value={windowForm.window_end} onChange={(e) => setWindowForm({ ...windowForm, window_end: e.target.value })} />
                  </div>
                  <div style={{ flex: "1 1 0", minWidth: 90 }}>
                    <label style={{ fontSize: 11, color: "#8B8680", display: "block", marginBottom: 4 }}>Slot Interval (min)</label>
                    <input type="number" min="0" step="5" className="bk-input" value={windowForm.interval_minutes} onChange={(e) => setWindowForm({ ...windowForm, interval_minutes: e.target.value })} />
                  </div>
                </div>
                <p style={{ fontSize: 12, color: "#8B8680", margin: "0 0 12px" }}>
                  Customers can request any start/end time within this window. Slot Interval keeps a buffer of downtime before and after every booking. Minimum booking length is {MIN_BOOKING_LENGTH} minutes.
                </p>
                {windowSaveError && <p style={{ fontSize: 12, color: "#A32D2D", margin: "0 0 10px" }}>{windowSaveError}</p>}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button className="bk-primary" onClick={handleSaveWindow} disabled={windowSaving}>
                    <Check size={15} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                    {windowSaving ? "Saving…" : "Save availability"}
                  </button>
                  {windowSaved && <span style={{ fontSize: 13, color: "#5C8A72", fontWeight: 600 }}>Saved</span>}
                </div>
              </>
            )}
          </div>

          <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "#6b6657", textTransform: "uppercase", letterSpacing: "0.04em" }}>Bookings for this day</h3>
          {dayLoading ? (
            <p style={{ fontSize: 13, color: "#8B8680" }}>Loading…</p>
          ) : bookings.length === 0 ? (
            <EmptyState text="No bookings yet for this day." />
          ) : (
            <div>
              {bookings.map((b) => (
                <AdminBookingRow key={b.id} booking={b} interval={Number(windowForm.interval_minutes) || 0} onDelete={() => onDeleteBooking(b.id)} />
              ))}
            </div>
          )}

          <BlockedDatesPanel adminToken={adminToken} onAuthFailure={onAuthFailure} loadCalendarMonth={loadCalendarMonth} loadDay={loadDay} currentDateKey={dateKey(current)} />
        </div>
      </div>

      <SecurityPanel adminToken={adminToken} onAuthFailure={onAuthFailure} />
      <BrandingPanel branding={branding} setBranding={setBranding} adminToken={adminToken} onAuthFailure={onAuthFailure} />
    </div>
  );
}

function AdminBookingRow({ booking, interval, onDelete }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {interval > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "#A8A39A", padding: "4px 14px", fontStyle: "italic" }}>
          <span style={{ flex: 1, borderTop: "1px dashed #D7D2C5" }} /><span>{interval} min buffer before</span><span style={{ flex: 1, borderTop: "1px dashed #D7D2C5" }} />
        </div>
      )}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", background: "#fff", border: "1px solid #E3DECF", borderLeft: "3px solid #1A2B3D", borderRadius: 8, padding: "12px 14px" }}>
        <div style={{ width: 80, flexShrink: 0, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13, paddingTop: 2 }}>
          <div style={{ fontWeight: 700 }}>{formatClock(booking.start)}</div>
          <div style={{ color: "#8B8680", fontSize: 11 }}>{formatClock(booking.end)}</div>
        </div>
        <div style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
          <div style={{ fontWeight: 700 }}>{booking.name}{booking.phone ? ` · ${booking.phone}` : ""}{booking.email ? ` · ${booking.email}` : ""}</div>
          {booking.address && <div style={{ color: "#1A2B3D", marginTop: 2 }}>{booking.address}</div>}
          {booking.notes && <div style={{ color: "#6b6657", marginTop: 2 }}>{booking.notes}</div>}
        </div>
        <button className="bk-icon-btn" onClick={onDelete} aria-label="Delete booking" style={{ color: "#A32D2D" }}><Trash2 size={15} /></button>
      </div>
      {interval > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "#A8A39A", padding: "4px 14px", fontStyle: "italic" }}>
          <span style={{ flex: 1, borderTop: "1px dashed #D7D2C5" }} /><span>{interval} min buffer after</span><span style={{ flex: 1, borderTop: "1px dashed #D7D2C5" }} />
        </div>
      )}
    </div>
  );
}

// ---------- security panel (admin password change) ----------

// Groups a flat list of individual blocked dates into consecutive ranges for
// display — e.g. ["2026-09-10","2026-09-11","2026-09-12"] becomes one row
// "Sep 10 – Sep 12" instead of three separate rows, since they were almost
// certainly blocked together as one action.
function groupConsecutiveDates(blockedDates) {
  if (blockedDates.length === 0) return [];
  const sorted = [...blockedDates].sort((a, b) => a.date.localeCompare(b.date));
  const groups = [];
  let currentGroup = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prevDate = new Date(sorted[i - 1].date + "T00:00:00Z");
    const curDate = new Date(sorted[i].date + "T00:00:00Z");
    const dayDiff = (curDate - prevDate) / (24 * 60 * 60 * 1000);
    const sameReason = sorted[i].reason === sorted[i - 1].reason;
    if (dayDiff === 1 && sameReason) {
      currentGroup.push(sorted[i]);
    } else {
      groups.push(currentGroup);
      currentGroup = [sorted[i]];
    }
  }
  groups.push(currentGroup);
  return groups;
}

function formatRangeLabel(group) {
  const fmt = (d) => new Date(d + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  if (group.length === 1) return fmt(group[0].date);
  return `${fmt(group[0].date)} – ${fmt(group[group.length - 1].date)}`;
}

function BlockedDatesPanel({ adminToken, onAuthFailure, loadCalendarMonth, loadDay, currentDateKey }) {
  const [blockedDates, setBlockedDates] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formStatus, setFormStatus] = useState("");
  const [formStatusIsError, setFormStatusIsError] = useState(false);

  const [unblockingDates, setUnblockingDates] = useState(new Set());

  const loadList = useCallback(async () => {
    setListLoading(true);
    setListError("");
    try {
      const data = await api.adminListBlockedDates(adminToken);
      setBlockedDates(data.blockedDates || []);
    } catch (e) {
      if (e.status === 401) {
        onAuthFailure();
      } else {
        setListError(e.message || "Couldn't load blocked dates.");
      }
    } finally {
      setListLoading(false);
    }
  }, [adminToken, onAuthFailure]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  async function handleBlock() {
    setFormStatus("");
    if (!startDate || !endDate) {
      setFormStatus("Pick both a start and end date.");
      setFormStatusIsError(true);
      return;
    }
    if (startDate > endDate) {
      setFormStatus("Start date must be on or before the end date.");
      setFormStatusIsError(true);
      return;
    }
    setSubmitting(true);
    try {
      await api.adminBlockDates(startDate, endDate, reason, adminToken);
      setFormStatus("Days blocked.");
      setFormStatusIsError(false);
      setStartDate("");
      setEndDate("");
      setReason("");
      await loadList();
      await loadCalendarMonth();
      if (loadDay) await loadDay();
    } catch (e) {
      if (e.status === 401) {
        onAuthFailure();
      } else {
        setFormStatus(e.message || "Couldn't block those days.");
        setFormStatusIsError(true);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUnblockGroup(group) {
    const dates = group.map((g) => g.date);
    setUnblockingDates((prev) => new Set([...prev, ...dates]));
    try {
      for (const d of dates) {
        await api.adminUnblockDate(d, adminToken);
      }
      await loadList();
      await loadCalendarMonth();
      if (loadDay) await loadDay();
    } catch (e) {
      if (e.status === 401) onAuthFailure();
    } finally {
      setUnblockingDates((prev) => {
        const next = new Set(prev);
        dates.forEach((d) => next.delete(d));
        return next;
      });
    }
  }

  const groups = groupConsecutiveDates(blockedDates);

  return (
    <div style={{ background: "#fff", border: "1px solid #E3DECF", borderRadius: 12, padding: 16, marginTop: 24 }}>
      <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: "#6b6657", textTransform: "uppercase", letterSpacing: "0.04em" }}>Block out days</h3>
      <p style={{ fontSize: 12, color: "#8B8680", margin: "0 0 14px" }}>
        Mark days as out of service — vacations, holidays, anything where customers shouldn't be able to book. Days with existing bookings can't be blocked; cancel those bookings first if needed.
      </p>

      <div className="gen-row" style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 0", minWidth: 120 }}>
          <label style={{ fontSize: 11, color: "#8B8680", display: "block", marginBottom: 4 }}>Start date</label>
          <input type="date" className="bk-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div style={{ flex: "1 1 0", minWidth: 120 }}>
          <label style={{ fontSize: 11, color: "#8B8680", display: "block", marginBottom: 4 }}>End date</label>
          <input type="date" className="bk-input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div style={{ flex: "1 1 0", minWidth: 120 }}>
          <label style={{ fontSize: 11, color: "#8B8680", display: "block", marginBottom: 4 }}>Reason (optional)</label>
          <input type="text" className="bk-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Vacation" />
        </div>
      </div>

      {formStatus && (
        <p style={{ fontSize: 12, color: formStatusIsError ? "#A32D2D" : "#5C8A72", margin: "0 0 12px" }}>{formStatus}</p>
      )}

      <button className="bk-primary" onClick={handleBlock} disabled={submitting} style={{ marginBottom: 20 }}>
        {submitting ? "Blocking…" : "Block these days"}
      </button>

      <h4 style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "#6b6657", textTransform: "uppercase", letterSpacing: "0.04em" }}>Currently blocked</h4>
      {listLoading ? (
        <p style={{ fontSize: 13, color: "#8B8680" }}>Loading…</p>
      ) : listError ? (
        <p style={{ fontSize: 12, color: "#A32D2D" }}>{listError}</p>
      ) : groups.length === 0 ? (
        <p style={{ fontSize: 13, color: "#8B8680" }}>No days are currently blocked.</p>
      ) : (
        <div>
          {groups.map((group, idx) => {
            const isUnblocking = group.some((g) => unblockingDates.has(g.date));
            const includesCurrentDay = currentDateKey && group.some((g) => g.date === currentDateKey);
            return (
              <div key={idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px", background: "#F5F3EE", borderRadius: 8, marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>
                    {formatRangeLabel(group)}
                    {includesCurrentDay && <span style={{ fontSize: 11, color: "#8B8680", fontWeight: 500 }}> (currently viewing)</span>}
                  </div>
                  {group[0].reason && <div style={{ fontSize: 12, color: "#6b6657", marginTop: 2 }}>{group[0].reason}</div>}
                </div>
                <button className="bk-ghost" style={{ padding: "6px 12px", fontSize: 12, flexShrink: 0 }} onClick={() => handleUnblockGroup(group)} disabled={isUnblocking}>
                  {isUnblocking ? "Unblocking…" : "Unblock"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SecurityPanel({ adminToken, onAuthFailure }) {
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [status, setStatus] = useState("");
  const [statusIsError, setStatusIsError] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setStatus("");
    if (!newPw.trim()) {
      setStatus("Enter a new password.");
      setStatusIsError(true);
      return;
    }
    if (newPw !== confirmPw) {
      setStatus("Passwords don't match.");
      setStatusIsError(true);
      return;
    }
    setSaving(true);
    try {
      await api.adminChangePassword(newPw, adminToken);
      setStatus("Password updated.");
      setStatusIsError(false);
      setNewPw("");
      setConfirmPw("");
    } catch (e) {
      if (e.status === 401) {
        onAuthFailure();
      } else {
        setStatus(e.message || "Something went wrong.");
        setStatusIsError(true);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ background: "#fff", border: "1px solid #E3DECF", borderRadius: 12, padding: 16, marginTop: 24 }}>
      <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: "#6b6657", textTransform: "uppercase", letterSpacing: "0.04em" }}>Admin access</h3>
      <p style={{ fontSize: 12, color: "#8B8680", margin: "0 0 14px" }}>
        Change the password used to access this admin view. The password itself is stored as a secure hash in the database — even an administrator with database access can't read it back in plain text, which is why there's no "show current password" option here anymore.
      </p>
      <label style={{ fontSize: 11, color: "#8B8680", display: "block", marginBottom: 4 }}>New password</label>
      <input type="password" className="bk-input" value={newPw} onChange={(e) => setNewPw(e.target.value)} style={{ marginBottom: 10 }} placeholder="Enter a new password" />
      <label style={{ fontSize: 11, color: "#8B8680", display: "block", marginBottom: 4 }}>Confirm new password</label>
      <input type="password" className="bk-input" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} style={{ marginBottom: 12 }} placeholder="Re-enter the new password" />
      {status && <p style={{ fontSize: 12, color: statusIsError ? "#A32D2D" : "#5C8A72", margin: "0 0 12px" }}>{status}</p>}
      <button className="bk-primary" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save new password"}</button>
    </div>
  );
}

// ---------- branding panel ----------

function BrandingPanel({ branding, setBranding, adminToken, onAuthFailure }) {
  const [nameInput, setNameInput] = useState(branding.name);
  const [logoPreview, setLogoPreview] = useState(branding.logo);
  const [status, setStatus] = useState("");
  const [statusIsError, setStatusIsError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [processingImage, setProcessingImage] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    setNameInput(branding.name);
    setLogoPreview(branding.logo);
  }, [branding.name, branding.logo]);

  function handleFileChange(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setStatus("Please choose an image file.");
      setStatusIsError(true);
      return;
    }
    setProcessingImage(true);
    setStatus("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 256;
        let { width, height } = img;
        if (width > height) {
          if (width > maxDim) { height = Math.round((height * maxDim) / width); width = maxDim; }
        } else {
          if (height > maxDim) { width = Math.round((width * maxDim) / height); height = maxDim; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        setLogoPreview(canvas.toDataURL("image/png"));
        setProcessingImage(false);
      };
      img.onerror = () => {
        setStatus("Couldn't read that image — try a different file.");
        setStatusIsError(true);
        setProcessingImage(false);
      };
      img.src = ev.target.result;
    };
    reader.onerror = () => {
      setStatus("Couldn't read that file.");
      setStatusIsError(true);
      setProcessingImage(false);
    };
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    setStatus("");
    if (!nameInput.trim()) {
      setStatus("Business name can't be empty.");
      setStatusIsError(true);
      return;
    }
    setSaving(true);
    try {
      await api.adminSetBranding(nameInput, logoPreview, adminToken);
      setBranding({ name: nameInput.trim(), logo: logoPreview });
      setStatus("Saved.");
      setStatusIsError(false);
    } catch (e) {
      if (e.status === 401) {
        onAuthFailure();
      } else {
        setStatus(e.message || "Something went wrong.");
        setStatusIsError(true);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ background: "#fff", border: "1px solid #E3DECF", borderRadius: 12, padding: 16, marginTop: 24 }}>
      <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: "#6b6657", textTransform: "uppercase", letterSpacing: "0.04em" }}>Business branding</h3>
      <p style={{ fontSize: 12, color: "#8B8680", margin: "0 0 14px" }}>Change the logo and business name shown in the title bar. Handy if this app gets reused for a different business.</p>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ textAlign: "center" }}>
          {logoPreview ? (
            <img src={logoPreview} alt="Logo preview" style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", border: "1px solid #E3DECF", display: "block", marginBottom: 8 }} />
          ) : (
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#E8702A", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
              <Car size={28} color="#fff" />
            </div>
          )}
          <button className="bk-ghost" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => fileInputRef.current && fileInputRef.current.click()} disabled={processingImage}>
            {processingImage ? "Processing…" : "Choose image"}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: "none" }} />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ fontSize: 11, color: "#8B8680", display: "block", marginBottom: 4 }}>Business name</label>
          <input type="text" className="bk-input" value={nameInput} onChange={(e) => setNameInput(e.target.value)} style={{ marginBottom: 10 }} placeholder="Your business name" />
          {status && <p style={{ fontSize: 12, color: statusIsError ? "#A32D2D" : "#5C8A72", margin: "0 0 10px" }}>{status}</p>}
          <button className="bk-primary" onClick={handleSave} disabled={saving || processingImage}>{saving ? "Saving…" : "Save branding"}</button>
        </div>
      </div>
    </div>
  );
}

// ---------- month calendar ----------

function MonthCalendar({ visibleMonth, setVisibleMonth, selectedDate, onSelectDate, calendarDays }) {
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const todayKey = dateKey(new Date());
  const selectedKey = dateKey(selectedDate);

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  function shiftMonth(delta) {
    setVisibleMonth(new Date(year, month + delta, 1));
  }

  const monthLabel = visibleMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const weekdayLabels = ["S", "M", "T", "W", "T", "F", "S"];

  return (
    <div style={{ background: "#fff", border: "1px solid #E3DECF", borderRadius: 12, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <button className="bk-icon-btn" onClick={() => shiftMonth(-1)} aria-label="Previous month" style={{ padding: 4 }}><ChevronLeft size={16} /></button>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{monthLabel}</span>
        <button className="bk-icon-btn" onClick={() => shiftMonth(1)} aria-label="Next month" style={{ padding: 4 }}><ChevronRight size={16} /></button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
        {weekdayLabels.map((w, i) => <div key={i} style={{ textAlign: "center", fontSize: 10, color: "#A8A39A", fontWeight: 700 }}>{w}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
        {cells.map((d, idx) => {
          if (d === null) return <div key={idx} />;
          const cellDate = new Date(year, month, d);
          const cellKey = dateKey(cellDate);
          const dayInfo = calendarDays[cellKey];
          const isBlocked = !!(dayInfo && dayInfo.blocked);
          const fraction = dayInfo ? dayInfo.fraction : undefined;
          const colors = loadColor(fraction === undefined ? null : fraction, isBlocked);
          const isToday = cellKey === todayKey;
          const isSelected = cellKey === selectedKey;
          return (
            <button
              key={idx}
              onClick={() => onSelectDate(cellDate)}
              title={colors.label}
              style={{
                aspectRatio: "1", border: "none", borderRadius: 6, cursor: "pointer",
                background: colors.bg, color: colors.fg, fontSize: 12, fontWeight: isToday ? 800 : 600,
                outline: isSelected ? "2px solid #1A2B3D" : isToday ? "1.5px solid #1A2B3D" : "none",
                outlineOffset: "1px", display: "flex", alignItems: "center", justifyContent: "center",
                opacity: isBlocked ? 0.85 : 1,
              }}>
              {d}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12, fontSize: 10, color: "#8B8680" }}>
        <LegendDot color="#DEEDE3" label="Open" />
        <LegendDot color="#FBE9C9" label="Partial" />
        <LegendDot color="#F4DCD6" label="Full" />
        <LegendDot color="#EDEAE3" label="Unset" />
        <LegendDot color="#3A3530" label="Out of Service" />
      </div>
    </div>
  );
}

function LegendDot({ color, label }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 9, height: 9, borderRadius: 3, background: color, display: "inline-block" }} />
      {label}
    </span>
  );
}

function DayNav({ current, shiftDay, goToday }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div>
        <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8B8680", marginBottom: 3 }}>Schedule</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{formatDayLabel(current)}</h1>
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <button className="bk-icon-btn" onClick={() => shiftDay(-1)} aria-label="Previous day"><ChevronLeft size={20} /></button>
        <button className="bk-ghost" onClick={goToday} style={{ padding: "8px 14px", fontSize: 13 }}>Today</button>
        <button className="bk-icon-btn" onClick={() => shiftDay(1)} aria-label="Next day"><ChevronRight size={20} /></button>
      </div>
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div style={{ border: "1px dashed #D7D2C5", borderRadius: 10, padding: "40px 20px", textAlign: "center", color: "#8B8680", marginTop: 18 }}>
      <CalendarIcon size={26} style={{ marginBottom: 10, opacity: 0.5 }} />
      <p style={{ margin: 0, fontSize: 14 }}>{text}</p>
    </div>
  );
}

function Modal({ children, onClose }) {
  // Lock background scroll while a modal is open — on mobile, without this, touch
  // scrolling can get captured by the page behind the modal instead of the modal's
  // own scroll container, making the bottom of the modal unreachable.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div
      className="modal-overlay"
      style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(26,43,61,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16, zIndex: 50,
        overscrollBehavior: "contain",
      }}
      onClick={onClose}
    >
      <div
        className="modal-box"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 14, padding: 22,
          maxWidth: 420, width: "100%",
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
        }}
      >
        {children}
      </div>
    </div>
  );
}
