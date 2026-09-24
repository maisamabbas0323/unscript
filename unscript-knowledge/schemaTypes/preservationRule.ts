import {defineType, defineField, defineArrayMember} from 'sanity'
import {LockIcon} from '@sanity/icons/Lock'

/**
 * Preservation Rule — what must survive transformation unchanged. This is
 * critical: natural rewriting must never be treated as permission to
 * change facts, meaning, intent, names, figures, or requirements.
 */
export const preservationRule = defineType({
  name: 'preservationRule',
  title: 'Preservation Rule',
  type: 'document',
  icon: LockIcon,
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      description: 'Short name of the rule (e.g. "Preserve numeric figures").',
      validation: (rule) => rule.required().error('A title is required.'),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      description: 'Unique identifier for the rule, generated from the title.',
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
      description: 'What this rule protects and why it matters.',
      validation: (rule) => rule.required().error('A description is required.'),
    }),
    defineField({
      name: 'whatToPreserve',
      title: 'What to preserve',
      type: 'text',
      rows: 4,
      description: 'The content elements the transformation must keep.',
      validation: (rule) => rule.required().error('Describe what must be preserved.'),
    }),
    defineField({
      name: 'whatCanChange',
      title: 'What can change',
      type: 'text',
      rows: 4,
      description: 'Elements that are free to be reworded or restructured.',
      validation: (rule) => rule.required().error('Describe what may change.'),
    }),
    defineField({
      name: 'whatMustNotChange',
      title: 'What must not change',
      type: 'text',
      rows: 4,
      description:
        'Facts, names, figures, requirements, intent — anything the transformation may not alter.',
      validation: (rule) => rule.required().error('Describe what must not change.'),
    }),
    defineField({
      name: 'priority',
      title: 'Priority',
      type: 'number',
      description:
        'Weight of this rule when it conflicts with transformation. Higher wins. Use 1–100.',
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
      name: 'appliesTo',
      title: 'Applies to content types',
      type: 'array',
      description: 'Content types this preservation rule applies to.',
      of: [
        defineArrayMember({
          type: 'reference',
          to: [{type: 'contentType'}],
        }),
      ],
      validation: (rule) => rule.unique(),
    }),
    defineField({
      name: 'relatedTransformationRules',
      title: 'Related transformation rules',
      type: 'array',
      description: 'Transformation rules this preservation rule constrains.',
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
      description: 'Origin document, when this rule is based on one.',
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
