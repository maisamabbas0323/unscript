import {defineType, defineField, defineArrayMember} from 'sanity'
import {CommentIcon} from '@sanity/icons/Comment'

/**
 * Tone Rule — a desired tone, plus the language and rhythm that produce
 * it. Rules reference the transformation and preservation rules that
 * support them.
 */
export const toneRule = defineType({
  name: 'toneRule',
  title: 'Tone Rule',
  type: 'document',
  icon: CommentIcon,
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      description: 'Name of the tone (e.g. "Confident", "Warm", "Direct").',
      validation: (rule) => rule.required().error('A title is required.'),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      description: 'Unique identifier for the tone, generated from the title.',
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
      description: 'What this tone sounds like and when it fits.',
      validation: (rule) => rule.required().error('A description is required.'),
    }),
    defineField({
      name: 'toneCharacteristics',
      title: 'Tone characteristics',
      type: 'text',
      rows: 4,
      description: 'The recognizable qualities of this tone.',
      validation: (rule) => rule.required().error('Describe the tone characteristics.'),
    }),
    defineField({
      name: 'preferredLanguage',
      title: 'Preferred language',
      type: 'text',
      rows: 4,
      description: 'Phrasing and word choices that produce this tone.',
      validation: (rule) => rule.required().error('Describe the preferred language.'),
    }),
    defineField({
      name: 'avoidLanguage',
      title: 'Avoid language',
      type: 'text',
      rows: 3,
      description: 'Phrasing that breaks or weakens this tone.',
    }),
    defineField({
      name: 'sentenceRhythm',
      title: 'Sentence rhythm',
      type: 'text',
      rows: 3,
      description: 'Sentence length and flow consistent with this tone.',
    }),
    defineField({
      name: 'vocabularyGuidance',
      title: 'Vocabulary guidance',
      type: 'text',
      rows: 3,
      description: 'Register, formality, and word-level guidance for this tone.',
    }),
    defineField({
      name: 'transformationRules',
      title: 'Transformation rules',
      type: 'array',
      description: 'Rules to apply when moving toward this tone.',
      of: [
        defineArrayMember({
          type: 'reference',
          to: [{type: 'transformationRule'}],
        }),
      ],
      validation: (rule) => rule.unique(),
    }),
    defineField({
      name: 'preservationRules',
      title: 'Preservation rules',
      type: 'array',
      description: 'Rules that must hold when applying this tone.',
      of: [
        defineArrayMember({
          type: 'reference',
          to: [{type: 'preservationRule'}],
        }),
      ],
      validation: (rule) => rule.unique(),
    }),
    defineField({
      name: 'contentTypes',
      title: 'Content types',
      type: 'array',
      description: 'Content types where this tone is appropriate.',
      of: [
        defineArrayMember({
          type: 'reference',
          to: [{type: 'contentType'}],
        }),
      ],
      validation: (rule) => rule.unique(),
    }),
    defineField({
      name: 'source',
      title: 'Source',
      type: 'reference',
      description: 'Origin document, when this tone is based on one.',
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
