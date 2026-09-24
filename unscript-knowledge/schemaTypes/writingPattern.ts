import {defineType, defineField, defineArrayMember} from 'sanity'
import {DocumentTextIcon} from '@sanity/icons/DocumentText'

/**
 * Writing Pattern — a recognizable stylistic pattern in user writing that
 * the transformation agent should detect and consider changing.
 */
export const writingPattern = defineType({
  name: 'writingPattern',
  title: 'Writing Pattern',
  type: 'document',
  icon: DocumentTextIcon,
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      description: 'Human-readable name of the pattern (e.g. "Passive voice stacking").',
      validation: (rule) => rule.required().error('A title is required.'),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      description: 'Unique identifier for the pattern, generated from the title.',
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
      name: 'pattern',
      title: 'Pattern',
      type: 'text',
      rows: 4,
      description: 'Describe the recognizable writing pattern itself.',
      validation: (rule) => rule.required().error('Describe the pattern.'),
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      rows: 4,
      description: 'Explain the pattern and why it matters.',
      validation: (rule) => rule.required().error('An explanation is required.'),
    }),
    defineField({
      name: 'whenToChange',
      title: 'When to change',
      type: 'text',
      rows: 4,
      description: 'Explain when this pattern should be transformed.',
      validation: (rule) =>
        rule.required().error('Describe when the pattern should be transformed.'),
    }),
    defineField({
      name: 'preferredTransformation',
      title: 'Preferred transformation',
      type: 'text',
      rows: 4,
      description: 'Describe the preferred transformation strategy.',
      validation: (rule) => rule.required().error('Describe the preferred transformation.'),
    }),
    defineField({
      name: 'examples',
      title: 'Examples',
      type: 'array',
      description: 'Concrete before/after examples of this pattern.',
      of: [
        defineArrayMember({
          name: 'patternExample',
          title: 'Example',
          type: 'object',
          fields: [
            defineField({
              name: 'before',
              title: 'Before',
              type: 'text',
              rows: 3,
              description: 'The text as written with the pattern present.',
              validation: (rule) => rule.required().error('Provide the "before" text.'),
            }),
            defineField({
              name: 'after',
              title: 'After',
              type: 'text',
              rows: 3,
              description: 'The same text after the pattern is transformed.',
              validation: (rule) => rule.required().error('Provide the "after" text.'),
            }),
            defineField({
              name: 'explanation',
              title: 'Explanation',
              type: 'text',
              rows: 2,
              description: 'Why this example qualifies and what changed.',
              validation: (rule) =>
                rule.required().error('Provide an explanation for the example.'),
            }),
          ],
          preview: {
            select: {
              title: 'before',
              subtitle: 'after',
            },
          },
        }),
      ],
      validation: (rule) =>
        rule.custom((examples: unknown) => {
          if (!Array.isArray(examples) || examples.length === 0) return true
          const allComplete = examples.every((example) => {
            const value = (example ?? {}) as Record<string, unknown>
            return (
              typeof value.before === 'string' &&
              value.before.trim() !== '' &&
              typeof value.after === 'string' &&
              value.after.trim() !== '' &&
              typeof value.explanation === 'string' &&
              value.explanation.trim() !== ''
            )
          })
          if (allComplete) return true
          return 'Every example must include "before", "after", and "explanation".'
        }),
    }),
    defineField({
      name: 'severity',
      title: 'Severity',
      type: 'string',
      description: 'How strongly this pattern affects the naturalness of the text.',
      options: {
        list: [
          {title: 'Low', value: 'low'},
          {title: 'Medium', value: 'medium'},
          {title: 'High', value: 'high'},
        ],
        layout: 'radio',
      },
      validation: (rule) => rule.required().error('Choose a severity level.'),
    }),
    defineField({
      name: 'contentTypes',
      title: 'Content types',
      type: 'array',
      description: 'Content types this pattern commonly appears in.',
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
      description: 'Origin document, when this pattern is based on one.',
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
