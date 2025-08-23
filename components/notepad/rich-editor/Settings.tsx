'use client';

import type {JSX} from 'react';
import {useState} from 'react';

import {useSettings} from './context/SettingsContext';
import Switch from './ui/Switch';
import type {SettingName} from './appSettings';

export default function Settings(): JSX.Element {
  const {
    setOption,
    settings: {
      isRichText,
      isAutocomplete,
      showTreeView,
      isCodeHighlighted,
      isCodeShiki,
    },
  } = useSettings();
  
  const [showSettings, setShowSettings] = useState(false);

  const handleToggleSettings = () => {
    setShowSettings(!showSettings);
  };

  const handleOptionChange = (option: SettingName, value: boolean) => {
    setOption(option, value);
  };

  return (
    <>
      <button
        id="options-button"
        className={`editor-dev-button ${showSettings ? 'active' : ''}`}
        onClick={handleToggleSettings}
        type="button"
        aria-label="Toggle settings"
      />
      {showSettings && (
        <div className="switches">
          <Switch
            onClick={() => handleOptionChange('showTreeView', !showTreeView)}
            checked={showTreeView}
            text="Debug View"
          />
          <Switch
            onClick={() => handleOptionChange('isRichText', !isRichText)}
            checked={isRichText}
            text="Rich Text"
          />
          <Switch
            onClick={() => handleOptionChange('isAutocomplete', !isAutocomplete)}
            checked={isAutocomplete}
            text="Autocomplete"
          />
          <Switch
            onClick={() => handleOptionChange('isCodeHighlighted', !isCodeHighlighted)}
            checked={isCodeHighlighted}
            text="Enable Code Highlighting"
          />
          <Switch
            onClick={() => handleOptionChange('isCodeShiki', !isCodeShiki)}
            checked={isCodeShiki}
            text="Use Shiki for Code Highlighting"
          />
        </div>
      )}
    </>
  );
}