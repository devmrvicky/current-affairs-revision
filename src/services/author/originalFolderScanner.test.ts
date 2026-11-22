import { describe, expect, it } from 'vitest';
import { buildOriginalFolderPathsFromKeys } from './originalFolderScanner';

describe('original ExamVerse folder discovery', () => {
  it('discovers nested folders for all four supported subjects', () => {
    const paths = buildOriginalFolderPathsFromKeys([
      '../../data/chapters/Mathematics/Test series/Set 1/questions.json',
      '../../data/chapters/English/Fixed preposition/Vidyagram/part-1.json',
      '../../data/chapters/Reasoning/Analogy/questions.json',
      '../../data/chapters/General Awareness/Polity/Parliament/questions.json',
    ]);
    expect(paths).toContainEqual({ subjectId: 'mathematics', subjectName: 'Mathematics', segments: ['Test series'] });
    expect(paths).toContainEqual({ subjectId: 'mathematics', subjectName: 'Mathematics', segments: ['Test series', 'Set 1'] });
    expect(paths).toContainEqual({ subjectId: 'english', subjectName: 'English', segments: ['Fixed preposition', 'Vidyagram'] });
    expect(paths).toContainEqual({ subjectId: 'reasoning', subjectName: 'Reasoning', segments: ['Analogy'] });
    expect(paths).toContainEqual({ subjectId: 'general-awareness', subjectName: 'General Awareness', segments: ['Polity', 'Parliament'] });
  });

  it('ignores unsupported subjects and assets directories', () => {
    const paths = buildOriginalFolderPathsFromKeys([
      '../../data/chapters/Computer Awareness/Hardware/questions.json',
      '../../data/chapters/English/Assets/image.json',
      '../../data/chapters/English/Fixed preposition/questions/asset-questions.json',
    ]);
    expect(paths).toEqual([]);
  });

  it('de-duplicates same folder paths regardless of case and whitespace', () => {
    const paths = buildOriginalFolderPathsFromKeys([
      '../../data/chapters/English/Fixed Preposition/a.json',
      '../../data/chapters/English/fixed  preposition/b.json',
    ]);
    expect(paths.filter((path) => path.segments.length === 1)).toHaveLength(1);
  });
});
