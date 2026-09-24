import {defineType, defineField, defineArrayMember} from 'sanity'
import {SunIcon} from '@sanity/icons/Sun'

/**
 * Humanization Level — how strongly writing is transformed toward a
 * natural, human style. Conceptual levels include Light, Natural, Human,
 * Deep, and Custom. These are knowledge concepts; the actual levels are
 * entered as documents, not hard-coded.
 */
export const humanizationLevel = defineType({
  name: 'humanizationLevel',
  title: 'Humanization Level',
  type: 'document',
  icon: SunIcon,
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      description: 'Name of the level (e.g. "Light", "Natural", "Deep").',
      validation: (rule) => rule.required().error('A title is required.'),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      description: 'Unique identifier for the level, generated from the title.',
      options: {source: 'title'},
      validation: (rule) =>
        rule
          .required()
          .error('A slug is required.')
          .custom((slug) => {
            if (!slug?.current) return true
            return /^[a-z0-9-]+$/.test(slug.current)
              ? true
              : 'Slug must be lowercase letters, numbers, and hyphens only.'
          }),
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      rows: 4,
      description: 'What this level means and when it should be used.',
      validation: (rule) => rule.required().error('A description is required.'),
    }),
    defineField({
      name: 'intensity',
      title: 'Intensity',
      type: 'number',
      description: 'Transformation intensity on a 1–10 scale.',
      validation: (rule) =>
        rule
          .required()
          .error('An intensity value is required.')
          .min(1)
          .error('Intensity must be at least 1.')
          .max(10)
          .error('Intensity cannot exceed 10.'),
    }),
    defineField({
      name: 'sentenceChange',
      title: 'Sentence change',
      type: 'text',
      rows: 3,
      description: 'How sentences are reworked at this level.',
      validation: (rule) => rule.required().error('Describe the sentence change.'),
    }),
    defineField({
      name: 'vocabularyChange',
      title: 'Vocabulary change',
      type: 'text',
      rows: 3,
      description: 'How word choice is adjusted at this level.',
      validation: (rule) => rule.required().error('Describe the vocabulary change.'),
    }),
    defineField({
      name: 'structureChange',
      title: 'Structure change',
      type: 'text',
      rows: 3,
      description: 'How the overall structure may change at this level.',
      validation: (rule) => rule.required().error('Describe the structure change.'),
    }),
    defineField({
      name: 'toneChange',
      title: 'Tone change',
      type: 'text',
      rows: 3,
      description: 'How the tone shifts at this level.',
      validation: (rule) => rule.required().error('Describe the tone change.'),
    }),
    defineField({
      name: 'preservationRules',
      title: 'Preservation rules',
      type: 'array',
      description: 'Rules that stay in force when applying this level.',
      of: [
        defineArrayMember({
          type: 'reference',
          to: [{type: 'preservationRule'}],
        }),
      ],
      validation: (rule) => rule.unique(),
    }),
    defineField({
      name: 'transformationRules',
      title: 'Transformation rules',
      type: 'array',
      description: 'Rules typically applied at this level.',
      of: [
        defineArrayMember({
          type: 'reference',
          to: [{type: 'transformationRule'}],
        }),
      ],
      validation: (rule) => rule.unique(),
    }),
    defineField({
      name: 'source',
      title: 'Source',
      type: 'reference',
      description: 'Origin document, when this level is based on one.',
      to: [{type: 'source'}],
    }),
    defineField({
      name: 'notes',
      title: 'Notes',
      type: 'text',
      rows: 3,
      description: 'Internal notes (not shown to end users).',
    }),
  ],
})
