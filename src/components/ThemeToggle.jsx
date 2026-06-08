import React from 'react'
import { Moon, Sun, Monitor, Palette } from 'lucide-react'

const ThemeToggle = ({ currentTheme, onThemeChange, isCollapsed }) => {

    // Safety check: if function is missing
    if (!onThemeChange) return null;

    const themes = [
        { id: 'emerald', label: 'Emerald', color: '#2d6a4f', icon: Palette },
        { id: 'blue', label: 'Corporate', color: '#2563eb', icon: Monitor },
        { id: 'dark', label: 'Midnight', color: '#0f172a', icon: Moon },
    ]

    const nextTheme = () => {
        const currentIndex = themes.findIndex(t => t.id === currentTheme)
        const nextIndex = (currentIndex + 1) % themes.length
        onThemeChange(themes[nextIndex].id)
    }

    if (isCollapsed) {
        return (
            <button
                onClick={nextTheme}
                className="w-full flex items-center justify-center p-3 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                title="Switch Theme"
            >
                <Palette size={20} />
            </button>
        )
    }

    return (
        <div className="bg-black/20 rounded-xl p-1 flex gap-1 mt-4 mx-2">
            {themes.map(theme => (
                <button
                    key={theme.id}
                    onClick={() => onThemeChange(theme.id)}
                    className={`flex-1 flex items-center justify-center p-2 rounded-lg transition-all ${currentTheme === theme.id
                            ? 'bg-white text-black shadow-lg scale-100'
                            : 'text-gray-400 hover:text-white hover:bg-white/5 active:scale-95'
                        }`}
                    title={theme.label}
                >
                    <theme.icon size={16} />
                </button>
            ))}
        </div>
    )
}

export default ThemeToggle
