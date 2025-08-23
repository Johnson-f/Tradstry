import type {EditorThemeClasses} from 'lexical';


import baseTheme from './PlaygroundEditorTheme';

const theme: EditorThemeClasses = {
  ...baseTheme,
  paragraph: 'm-0 relative',
};

export default theme;
