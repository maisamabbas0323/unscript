import {defineType, defineField, defineArrayMember} from 'sanity'
import {CheckmarkCircleIcon} from '@sanity/icons/CheckmarkCircle'

/**
 * User Decision — a durable decision or preference that may influence
 * future transformation behavior. This is a knowledge/decision record for
 * the agent architecture, not an application user account or auth system.
 */
export const userDecision = defineType({
  name: 'userDecision',
  title: 'User Decision',
  type: 'document',
  icon: CheckmarkCircleIcon,
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      description: 'Short name of the decision (e.g. "Keep British spellings").',
      validation: (rule) => rule.required().error('A title is required.'),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      description: 'Unique identifier for the decision, generated from the title.',
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
      name: 'context',
      title: 'Context',
      type: 'text',
      rows: 4,
      description: 'The situation in which this decision was made.',
      validation: (rule) => rule.required().error('Describe the context of the decision.'),
    }),
    defineField({
      name: 'decision',
      title: 'Decision',
      type: 'text',
      rows: 4,
      description: 'The decision itself and its expected effect on transformation.',
      validation: (rule) => rule.required().error('Record the decision.'),
    }),
    defineField({
      name: 'reason',
      title: 'Reason',
      type: 'text',
      rows: 3,
      description: 'Why this decision was made.',
    }),
    defineField({
      name: 'priority',
      title: 'Priority',
      type: 'number',
      description: 'How strongly this decision should influence behavior. Use 1–100.',
      validation: (rule) =>
        rule
          .required()
          .error('A priority is required.')
          .min(1)
          .error('Priority must be at least 1.')
          .max(100)
          .error('Priority cannot exceed 100.')
          .integer()
          .error('Priority must be a whole number.'),
    }),
    defineField({
      name: 'contentTypes',
      title: 'Content types',
      type: 'array',
      description: 'Content types this decision applies to.',
      of: [
        defineArrayMember({
          type: 'reference',
          to: [{type: 'contentType'}],
        }),
      ],
      validation: (rule) => rule.unique(),
    }),
    defineField({
      name: 'toneRules',
      title: 'Tone rules',
      type: 'array',
      description: 'Tones this decision prefers.',
      of: [
        defineArrayMember({
          type: 'reference',
          to: [{type: 'toneRule'}],
        }),
      ],
      validation: (rule) => rule.unique(),
    }),
    defineField({
      name: 'transformationRules',
      title: 'Transformation rules',
      type: 'array',
      description: 'Transformation rules this decision enables or constrains.',
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
      description: 'Preservation rules this decision reinforces.',
      of: [
        defineArrayMember({
          type: 'reference',
          to: [{type: 'preservationRule'}],
        }),
      ],
      validation: (rule) => rule.unique(),
    }),
    defineField({
      name: 'createdAt',
      title: 'Created date',
      type: 'datetime',
      description: 'When this decision was recorded.',
      initialValue: () => new Date().toISOString(),
      validation: (rule) => rule.required().error('A created date is required.'),
    }),
    defineField({
      name: 'source',
      title: 'Source',
      type: 'reference',
      description: 'Origin document, when this decision is based on one.',
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
