import {defineType, defineField, defineArrayMember} from 'sanity'
import {SyncIcon} from '@sanity/icons/Sync'

/**
 * Transformation Rule — a concrete instruction for how writing should be
 * transformed when a trigger applies. Rules can explicitly conflict with
 * other rules; the model must not apply conflicting rules blindly.
 */
export const transformationRule = defineType({
  name: 'transformationRule',
  title: 'Transformation Rule',
  type: 'document',
  icon: SyncIcon,
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      description: 'Short name of the rule (e.g. "Simplify noun phrases").',
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
      description: 'What this rule does at a glance.',
      validation: (rule) => rule.required().error('A description is required.'),
    }),
    defineField({
      name: 'trigger',
      title: 'Trigger',
      type: 'text',
      rows: 4,
      description: 'What pattern or situation activates this rule.',
      validation: (rule) => rule.required().error('Describe the trigger.'),
    }),
    defineField({
      name: 'instruction',
      title: 'Instruction',
      type: 'text',
      rows: 6,
      description: 'What transformation should happen when the rule fires.',
      validation: (rule) => rule.required().error('Write the transformation instruction.'),
    }),
    defineField({
      name: 'priority',
      title: 'Priority',
      type: 'number',
      description: 'Ordering among applicable rules. Higher runs first. Use 1–100.',
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
      description: 'Content types this rule applies to.',
      of: [
        defineArrayMember({
          type: 'reference',
          to: [{type: 'contentType'}],
        }),
      ],
      validation: (rule) => rule.unique(),
    }),
    defineField({
      name: 'appliesToTones',
      title: 'Applies to tones',
      type: 'array',
      description: 'Tones this rule helps produce.',
      of: [
        defineArrayMember({
          type: 'reference',
          to: [{type: 'toneRule'}],
        }),
      ],
      validation: (rule) => rule.unique(),
    }),
    defineField({
      name: 'relatedPatterns',
      title: 'Related patterns',
      type: 'array',
      description: 'Writing patterns this rule responds to.',
      of: [
        defineArrayMember({
          type: 'reference',
          to: [{type: 'writingPattern'}],
        }),
      ],
      validation: (rule) => rule.unique(),
    }),
    defineField({
      name: 'conflictsWith',
      title: 'Conflicts with',
      type: 'array',
      description: 'Rules that should not be applied together with this one.',
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
      description: 'Facts and intent that must be preserved when this rule is applied.',
      of: [
        defineArrayMember({
          type: 'reference',
          to: [{type: 'preservationRule'}],
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
