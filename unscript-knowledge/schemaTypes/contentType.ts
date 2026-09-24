import {defineType, defineField} from 'sanity'
import {TagIcon} from '@sanity/icons/Tag'

/**
 * Content Type — the kind of document being transformed (email, essay,
 * article, documentation, technical writing, social post, business
 * writing, casual writing, and so on). These are structured knowledge
 * concepts, not hard-coded lists.
 */
export const contentType = defineType({
  name: 'contentType',
  title: 'Content Type',
  type: 'document',
  icon: TagIcon,
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      description: 'Name of the content type (e.g. "Email", "Essay", "Article").',
      validation: (rule) => rule.required().error('A title is required.'),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      description: 'Unique identifier for the content type, generated from the title.',
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
      description: 'What this content type is and when it is used.',
      validation: (rule) => rule.required().error('A description is required.'),
    }),
    defineField({
      name: 'audience',
      title: 'Audience',
      type: 'text',
      rows: 3,
      description: 'Typical readers of this content type.',
    }),
    defineField({
      name: 'typicalStructure',
      title: 'Typical structure',
      type: 'text',
      rows: 4,
      description: 'Usual shape of the content (openings, sections, closings).',
    }),
    defineField({
      name: 'toneConsiderations',
      title: 'Tone considerations',
      type: 'text',
      rows: 4,
      description: 'Tone expectations and pitfalls for this content type.',
    }),
    defineField({
      name: 'preservationConsiderations',
      title: 'Preservation considerations',
      type: 'text',
      rows: 4,
      description: 'Facts, figures, or intent that must be preserved in this content type.',
    }),
    defineField({
      name: 'source',
      title: 'Source',
      type: 'reference',
      description: 'Origin document, when this content type is based on one.',
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
