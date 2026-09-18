import React, { useEffect, useState } from 'react'
import { Download, X, MonitorDown } from 'lucide-react'
import { getCachedStoreName } from '../config/storeConfig'

const PWA_PROMPT_UNTIL_KEY = 'invoiceflow_pwa_install_prompt_until'
const PWA_PROMPT_SESSION_KEY = 'invoiceflow_pwa_install_prompt_session'
const PWA_PROMPT_SNOOZE_DAYS = 7

// Capture the browser event as soon as this module loads. App authentication
// can take long enough for beforeinstallprompt to fire before this component
// is mounted on the login or authenticated screen.
if (typeof window !== 'undefined' && !window.__invoiceflowPwaPromptCapture) {
    window.__invoiceflowPwaPromptCapture = true
    window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault()
        window.__invoiceflowDeferredInstallEvent = event
        window.dispatchEvent(new Event('invoiceflow-install-prompt-ready'))
    })
}

const getLoginSessionKey = () => {
    try {
        const storedUser = JSON.parse(window.localStorage.getItem('invoiceflow_user') || 'null')
        return storedUser?.loginTime ? `login:${storedUser.loginTime}` : 'anonymous'
    } catch {
        return 'anonymous'
    }
}

const PwaInstallPrompt = () => {
    const storeName = getCachedStoreName()
    const [installEvent, setInstallEvent] = useState(() => window.__invoiceflowDeferredInstallEvent || null)
    const [isStandalone, setIsStandalone] = useState(false)
    const [dismissed, setDismissed] = useState(false)
    const [showPrompt, setShowPrompt] = useState(false)

    useEffect(() => {
        const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
        setIsStandalone(standalone)

        const sessionKey = getLoginSessionKey()
        const lastPromptSession = window.localStorage.getItem(PWA_PROMPT_SESSION_KEY)
        const snoozedUntil = Number(window.localStorage.getItem(PWA_PROMPT_UNTIL_KEY) || 0)
        const isFreshLogin = sessionKey.startsWith('login:') && sessionKey !== lastPromptSession
        const canShowPrompt = isFreshLogin || (sessionKey === lastPromptSession ? Date.now() >= snoozedUntil : !lastPromptSession)
        const handleInstallPromptReady = () => {
            const event = window.__invoiceflowDeferredInstallEvent
            if (!event) return
            if (!standalone && canShowPrompt) window.localStorage.setItem(PWA_PROMPT_SESSION_KEY, sessionKey)
            setInstallEvent(event)
            if (canShowPrompt) setShowPrompt(true)
        }
        const handleInstalled = () => {
            window.__invoiceflowDeferredInstallEvent = null
            setInstallEvent(null)
            setIsStandalone(true)
            setShowPrompt(false)
        }

        window.addEventListener('invoiceflow-install-prompt-ready', handleInstallPromptReady)
        handleInstallPromptReady()
        window.addEventListener('appinstalled', handleInstalled)
        return () => {
            window.removeEventListener('invoiceflow-install-prompt-ready', handleInstallPromptReady)
            window.removeEventListener('appinstalled', handleInstalled)
        }
    }, [])

    if (isStandalone || !showPrompt || dismissed) return null

    const installApp = async () => {
        if (!installEvent) return
        await installEvent.prompt()
        const choice = await installEvent.userChoice
        window.__invoiceflowDeferredInstallEvent = null
        setInstallEvent(null)
        if (choice?.outcome === 'dismissed') dismissPrompt()
    }

    const dismissPrompt = () => {
        const snoozedUntil = Date.now() + PWA_PROMPT_SNOOZE_DAYS * 24 * 60 * 60 * 1000
        window.localStorage.setItem(PWA_PROMPT_UNTIL_KEY, String(snoozedUntil))
        window.localStorage.setItem(PWA_PROMPT_SESSION_KEY, getLoginSessionKey())
        setDismissed(true)
    }

    return (
        <div className="pwa-install-overlay" role="dialog" aria-modal="true" aria-label={`Install ${storeName}`}>
            <div className="pwa-install-modal">
                <button type="button" onClick={dismissPrompt} className="pwa-install-dismiss" aria-label="Close install dialog">
                    <X size={20} />
                </button>
                <div className="pwa-install-hero">
                    <img src="/app-icon-192.png" alt={storeName} className="pwa-install-icon" />
                    <div>
                        <span className="pwa-install-kicker">{storeName.toUpperCase()}</span>
                        <strong>Install {storeName}</strong>
                        <span>Use billing, stock, purchases and reports like a proper app.</span>
                    </div>
                </div>
                <div className="pwa-install-benefits">
                    <span><MonitorDown size={16} /> Opens without browser controls</span>
                    <span><Download size={16} /> Home-screen and desktop access</span>
                </div>
                <div className="pwa-install-actions">
                    <button type="button" onClick={installApp} className="pwa-install-button">
                        <Download size={16} /> Install app
                    </button>
                    <button type="button" onClick={dismissPrompt} className="pwa-install-later">Later</button>
                </div>
            </div>
        </div>
    )
}

export default PwaInstallPrompt
