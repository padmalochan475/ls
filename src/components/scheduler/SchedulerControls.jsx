
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Search } from 'lucide-react';

// Helper to handle Tab navigation when Portal is open (preventing focus loss)
const handlePortalTab = (e, setIsOpen, dropdownRef) => {
    e.preventDefault();
    setIsOpen(false);

    // Find all focusable elements in the document
    const focusableSelectors = 'a[href], button, input, textarea, select, details, [tabindex]:not([tabindex="-1"])';
    const allFocusable = Array.from(document.querySelectorAll(focusableSelectors))
        .filter(el => !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden') && el.offsetParent !== null);

    // Find our trigger element
    const trigger = dropdownRef.current?.querySelector('[tabindex="0"]');
    if (!trigger) return;

    const currentIndex = allFocusable.indexOf(trigger);

    // Move focus to next or previous element
    if (currentIndex !== -1) {
        const nextIndex = e.shiftKey ? currentIndex - 1 : currentIndex + 1;
        if (nextIndex >= 0 && nextIndex < allFocusable.length) {
            allFocusable[nextIndex].focus();
        } else {
            // Fallback: If at edge of form, focus trigger so next Tab escapes correctly to browser chrome
            trigger.focus();
        }
    }
};

export const MultiSelectDropdown = ({ id, options = [], selected = [], onChange, label, icon: Icon, ariaLabelledby, ariaLabel }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const dropdownRef = useRef(null);
    const optionRefs = useRef([]);
    const searchInputRef = useRef(null);
    const preventAutoOpen = useRef(false);
    const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
    const [uniqueId] = useState(() => Math.random().toString(36).substr(2, 9)); // eslint-disable-line sonarjs/pseudo-random
    const portalId = `multiselect-portal-${uniqueId}`;

    // Handle Outside Clicks and Focus Loss
    useEffect(() => {
        const handleInteractionOutside = (event) => {
            const target = event.target;
            // Check if interaction is inside dropdown trigger
            if (dropdownRef.current && dropdownRef.current.contains(target)) return;
            // Check if interaction is inside portal
            const portal = document.getElementById(portalId);
            if (portal && portal.contains(target)) return;

            // Interaction is outside, close dropdown
            setIsOpen(false);
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleInteractionOutside);
            document.addEventListener('focusin', handleInteractionOutside); // Close if focus moves to another field
        }

        return () => {
            document.removeEventListener('mousedown', handleInteractionOutside);
            document.removeEventListener('focusin', handleInteractionOutside);
        };
    }, [isOpen, portalId]);

    // Position and Scroll
    useEffect(() => {
        const updateCoords = () => {
            if (dropdownRef.current) {
                const rect = dropdownRef.current.getBoundingClientRect();
                setCoords({
                    top: rect.bottom + 6,
                    left: rect.left,
                    width: rect.width
                });
            }
        };

        if (isOpen) {
            updateCoords();
            window.addEventListener('scroll', updateCoords, true);
            window.addEventListener('resize', updateCoords);
            setTimeout(() => {
                if (searchInputRef.current) searchInputRef.current.focus();
            }, 50);
        } else {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setSearchTerm('');
            setHighlightedIndex(0);
        }

        return () => {
            window.removeEventListener('scroll', updateCoords, true);
            window.removeEventListener('resize', updateCoords);
        };
    }, [isOpen]);

    const toggleOption = (option) => {
        if (selected.includes(option)) {
            onChange(selected.filter(item => item !== option));
        } else {
            onChange([...selected, option]);
        }
    };

    const filteredOptions = useMemo(() => options.filter(opt =>
        String(opt).toLowerCase().includes(searchTerm.toLowerCase())
    ), [options, searchTerm]);

    const handleKeyDown = (e) => {
        if (!isOpen) {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
                e.preventDefault();
                setIsOpen(true);
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setHighlightedIndex(prev => (prev + 1) % (filteredOptions.length + 1));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightedIndex(prev => (prev - 1 + (filteredOptions.length + 1)) % (filteredOptions.length + 1));
                break;
            case 'Enter':
                e.preventDefault();
                if (highlightedIndex === 0) {
                    onChange(selected.length === options.length ? [] : options);
                } else {
                    if (filteredOptions[highlightedIndex - 1]) {
                        toggleOption(filteredOptions[highlightedIndex - 1]);
                    }
                }
                break;
            case 'Escape':
                e.preventDefault();
                setIsOpen(false);
                preventAutoOpen.current = true;
                dropdownRef.current?.querySelector('[tabindex="0"]')?.focus();
                setTimeout(() => preventAutoOpen.current = false, 200);
                break;
            case 'Tab':
                handlePortalTab(e, setIsOpen, dropdownRef);
                break;
            default:
                break;
        }
    };

    useEffect(() => {
        if (isOpen && optionRefs.current[highlightedIndex]) {
            optionRefs.current[highlightedIndex].scrollIntoView({
                block: 'nearest',
                behavior: 'smooth'
            });
        }
    }, [highlightedIndex, isOpen]);

    return (
        <div ref={dropdownRef} style={{ position: 'relative', minWidth: '220px' }}>
            <div
                id={id}
                role="combobox"
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                aria-controls={portalId}
                aria-labelledby={ariaLabelledby}
                aria-label={ariaLabel}
                onClick={() => setIsOpen(!isOpen)}
                tabIndex="0"
                onKeyDown={handleKeyDown}
                onMouseDown={() => {
                    preventAutoOpen.current = true;
                    setTimeout(() => preventAutoOpen.current = false, 200);
                }}
                onFocus={() => {
                    if (!preventAutoOpen.current && !isOpen) {
                        setIsOpen(true);
                    }
                }}
                className="glass-input"
                style={{
                    padding: '10px 16px',
                    borderRadius: '12px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    color: 'white',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'all 0.2s ease',
                    boxShadow: isOpen ? '0 0 0 2px rgba(59, 130, 246, 0.5)' : 'none',
                    fontSize: '0.9rem',
                    fontWeight: 500
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {Icon && <Icon size={16} style={{ color: '#94a3b8' }} />}
                    <span style={{ color: selected.length > 0 ? 'white' : '#94a3b8' }}>
                        {selected.length > 0 ? `${selected.length} Selected` : label}
                    </span>
                </div>
                <ChevronDown size={16} style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
            </div>
            {isOpen && createPortal(
                <div
                    id={portalId}
                    className="animate-fade-in"
                    style={{
                        position: 'fixed',
                        top: coords.top,
                        left: coords.left,
                        width: coords.width,
                        maxHeight: '300px',
                        overflowY: 'auto',
                        background: '#1e293b',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '12px',
                        zIndex: 9999,
                        padding: '6px',
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)'
                    }}
                >
                    <div style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{
                            display: 'flex', alignItems: 'center',
                            background: 'rgba(255,255,255,0.05)',
                            borderRadius: '8px',
                            padding: '6px 10px'
                        }}>
                            <Search size={14} color="#94a3b8" />
                            <input
                                ref={searchInputRef}
                                aria-label="Search options"
                                type="text"
                                placeholder="Search..."
                                value={searchTerm}
                                onChange={(e) => {
                                    setSearchTerm(e.target.value);
                                    setHighlightedIndex(0);
                                }}
                                onKeyDown={handleKeyDown}
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'white',
                                    width: '100%',
                                    outline: 'none',
                                    fontSize: '0.85rem',
                                    marginLeft: '8px'
                                }}
                            />
                        </div>
                    </div>
                    {/* Select All */}
                    <div
                        ref={el => optionRefs.current[0] = el}
                        onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();

                            // Deterministic Check: Are ALL currently visible options selected?
                            const areAllOptionsSelected = options.length > 0 && options.every(opt => selected.includes(opt));

                            if (areAllOptionsSelected) {
                                onChange([]);
                            } else {
                                // Select all (merge with existing to be safe, or just options if we assume options is the full set)
                                // Usually options IS the full set here.
                                onChange(options);
                            }

                            if (searchInputRef.current) setTimeout(() => searchInputRef.current.focus(), 0);
                        }}
                        onMouseEnter={() => setHighlightedIndex(0)}
                        style={{
                            padding: '8px 12px',
                            cursor: 'pointer',
                            borderBottom: '1px solid rgba(255,255,255,0.1)',
                            marginBottom: '4px',
                            fontWeight: 600,
                            fontSize: '0.85rem',
                            color: '#60a5fa',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: highlightedIndex === 0 ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                            userSelect: 'none'
                        }}
                    >
                        {options.length > 0 && options.every(opt => selected.includes(opt)) ? 'Unselect All' : 'Select All'}
                    </div>
                    {/* Options */}
                    {filteredOptions.length > 0 ? filteredOptions.map((opt, idx) => (
                        <div
                            key={opt}
                            ref={el => optionRefs.current[idx + 1] = el}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => toggleOption(opt)}
                            onMouseEnter={() => setHighlightedIndex(idx + 1)}
                            style={{
                                padding: '8px 12px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                background: (selected.includes(opt) || highlightedIndex === idx + 1) ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                                borderRadius: '8px',
                                marginBottom: '2px',
                                fontSize: '0.9rem',
                                transition: 'background 0.15s',
                                color: selected.includes(opt) ? 'white' : '#cbd5e1'
                            }}
                        >
                            <div style={{
                                width: '16px',
                                height: '16px',
                                borderRadius: '4px',
                                border: selected.includes(opt) ? 'none' : '2px solid #475569',
                                background: selected.includes(opt) ? '#3b82f6' : 'transparent',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.2s'
                            }}>
                                {selected.includes(opt) && <Check size={12} color="white" strokeWidth={3} />}
                            </div>
                            {opt}
                        </div>
                    )) : (
                        <div style={{ padding: '12px', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
                            No results found
                        </div>
                    )}
                </div>,
                document.body
            )}
        </div>
    );
};

export const Select = ({ id, options = [], value, onChange, placeholder, icon: Icon, disabled = false, style, ariaLabelledby, ariaLabel }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const dropdownRef = useRef(null);
    const optionRefs = useRef([]);
    const searchInputRef = useRef(null);
    const preventAutoOpen = useRef(false);
    const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
    const [uniqueId] = useState(() => Math.random().toString(36).substr(2, 9)); // eslint-disable-line sonarjs/pseudo-random
    const portalId = `select-portal-${uniqueId}`;

    // Handle Outside Clicks and Focus Loss
    useEffect(() => {
        // eslint-disable-next-line sonarjs/no-identical-functions
        const handleInteractionOutside = (event) => {
            const target = event.target;
            if (dropdownRef.current && dropdownRef.current.contains(target)) return;
            const portal = document.getElementById(portalId);
            if (portal && portal.contains(target)) return;

            setIsOpen(false);
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleInteractionOutside);
            document.addEventListener('focusin', handleInteractionOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleInteractionOutside);
            document.removeEventListener('focusin', handleInteractionOutside);
        };
    }, [isOpen, portalId]);

     
    useEffect(() => {
        const updateCoords = () => {
            if (dropdownRef.current) {
                const rect = dropdownRef.current.getBoundingClientRect();
                setCoords({
                    top: rect.bottom + 6,
                    left: rect.left,
                    width: rect.width
                });
            }
        };

        if (isOpen) {
            updateCoords();
            window.addEventListener('scroll', updateCoords, true);
            window.addEventListener('resize', updateCoords);
            setTimeout(() => {
                if (searchInputRef.current) searchInputRef.current.focus();
            }, 50);
        } else {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setSearchTerm('');
            setHighlightedIndex(0);
        }

        return () => {
            window.removeEventListener('scroll', updateCoords, true);
            window.removeEventListener('resize', updateCoords);
        };
    }, [isOpen]);

    const normalizedOptions = useMemo(() => options.map(opt => {
        if (typeof opt === 'object' && opt !== null) {
            return { value: opt.value, label: opt.label || opt.value };
        }
        return { value: opt, label: opt };
    }), [options]);

    const filteredOptions = useMemo(() => normalizedOptions.filter(opt =>
        String(opt.label).toLowerCase().includes(searchTerm.toLowerCase())
    ), [normalizedOptions, searchTerm]);

    const selectedOption = useMemo(() =>
        normalizedOptions.find(opt => opt.value === value),
        [normalizedOptions, value]);

    const handleKeyDown = (e) => {
        if (disabled) return;

        if (!isOpen) {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
                e.preventDefault();
                setIsOpen(true);
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                if (filteredOptions.length > 0)
                    setHighlightedIndex(prev => (prev + 1) % filteredOptions.length);
                break;
            case 'ArrowUp':
                e.preventDefault();
                if (filteredOptions.length > 0)
                    setHighlightedIndex(prev => (prev - 1 + filteredOptions.length) % filteredOptions.length);
                break;
            case 'Enter':
                e.preventDefault();
                if (filteredOptions[highlightedIndex]) {
                    onChange(filteredOptions[highlightedIndex].value);
                    setIsOpen(false);
                    preventAutoOpen.current = true;
                    dropdownRef.current?.querySelector('[tabindex="0"]')?.focus();
                    setTimeout(() => preventAutoOpen.current = false, 200);
                }
                break;
            case 'Escape':
                e.preventDefault();
                setIsOpen(false);
                preventAutoOpen.current = true;
                dropdownRef.current?.querySelector('[tabindex="0"]')?.focus();
                setTimeout(() => preventAutoOpen.current = false, 200);
                break;
            case 'Tab':
                handlePortalTab(e, setIsOpen, dropdownRef);
                break;
            default:
                break;
        }
    };

    useEffect(() => {
        if (isOpen && optionRefs.current[highlightedIndex]) {
            optionRefs.current[highlightedIndex].scrollIntoView({
                block: 'nearest',
                behavior: 'smooth'
            });
        }
    }, [highlightedIndex, isOpen]);


    return (
        <div ref={dropdownRef} style={{ position: 'relative', width: '100%', ...style }}>
            <div
                id={id}
                role="combobox"
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                aria-controls={portalId}
                aria-disabled={disabled}
                aria-labelledby={ariaLabelledby}
                aria-label={ariaLabel}
                onClick={() => !disabled && setIsOpen(!isOpen)}
                tabIndex={disabled ? -1 : 0}
                onKeyDown={handleKeyDown}
                onMouseDown={() => {
                    preventAutoOpen.current = true;
                    setTimeout(() => preventAutoOpen.current = false, 200);
                }}
                onFocus={() => {
                    if (!disabled && !preventAutoOpen.current && !isOpen) {
                        setIsOpen(true);
                    }
                }}
                className="glass-input"
                style={{
                    padding: '10px 12px',
                    borderRadius: '12px',
                    background: disabled ? 'rgba(255, 255, 255, 0.02)' : 'rgba(255, 255, 255, 0.05)',
                    color: selectedOption ? 'white' : '#94a3b8',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'all 0.2s ease',
                    fontSize: '0.85rem',
                    fontWeight: 500,
                    opacity: disabled ? 0.6 : 1
                }}
                onMouseEnter={(e) => !disabled && (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)')}
                onMouseLeave={(e) => !disabled && (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)')}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                    {Icon && <Icon size={16} style={{ color: '#94a3b8', flexShrink: 0 }} />}
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {selectedOption ? selectedOption.label : placeholder}
                    </span>
                </div>
                <ChevronDown size={16} style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }} />
            </div>

            {isOpen && !disabled && createPortal(
                <div
                    id={portalId}
                    className="animate-fade-in"
                    style={{
                        position: 'fixed',
                        top: coords.top,
                        left: coords.left,
                        width: coords.width,
                        maxHeight: '250px',
                        overflowY: 'auto',
                        background: '#1e293b',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '12px',
                        zIndex: 9999,
                        padding: '6px',
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)'
                    }}
                >
                    <div style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '6px 10px' }}>
                            <Search size={14} color="#94a3b8" />
                            <input
                                ref={searchInputRef}
                                aria-label="Search options"
                                type="text"
                                placeholder="Search..."
                                value={searchTerm}
                                onChange={(e) => {
                                    setSearchTerm(e.target.value);
                                    setHighlightedIndex(0);
                                }}
                                onKeyDown={handleKeyDown}
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'white',
                                    width: '100%',
                                    outline: 'none',
                                    fontSize: '0.85rem',
                                    marginLeft: '8px'
                                }}
                            />
                        </div>
                    </div>
                    {filteredOptions.length > 0 ? filteredOptions.map((opt, idx) => (
                        <div
                            key={opt.value}
                            ref={el => optionRefs.current[idx] = el}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                                onChange(opt.value);
                                setIsOpen(false);
                                preventAutoOpen.current = true;
                                dropdownRef.current?.querySelector('[tabindex="0"]')?.focus();
                                setTimeout(() => preventAutoOpen.current = false, 200);
                            }}
                            onMouseEnter={() => setHighlightedIndex(idx)}
                            style={{
                                padding: '8px 12px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                background: (value === opt.value || highlightedIndex === idx) ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                                borderRadius: '8px',
                                marginBottom: '2px',
                                fontSize: '0.9rem',
                                color: value === opt.value ? 'white' : '#cbd5e1',
                                transition: 'background 0.15s'
                            }}
                        >
                            {value === opt.value && <Check size={14} color="#60a5fa" />}
                            {opt.label}
                        </div>
                    )) : (
                        <div style={{ padding: '12px', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
                            No options found
                        </div>
                    )}
                </div>,
                document.body
            )}
        </div>
    );
};
