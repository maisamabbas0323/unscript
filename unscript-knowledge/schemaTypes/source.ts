import {defineType, defineField} from 'sanity'
import {BookIcon} from '@sanity/icons/Book'

/**
 * Source — provenance for knowledge in the knowledge base. Sources document
 * where rules, patterns, and levels come from. Never invent URLs, authors,
 * publishers, or dates: sources are entered deliberately with real data.
 */
export const source = defineType({
  name: 'source',
  title: 'Source',
  type: 'document',
  icon: BookIcon,
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      description: 'Short reference name for this source (e.g. "Nielsen writing guide").',
      validation: (rule) => rule.required().error('A title is required.'),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      description: 'Unique identifier for the source, generated from the title.',
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
      name: 'name',
      title: 'Name',
      type: 'string',
      description: 'Full name of the source as it should appear in references.',
      validation: (rule) => rule.required().error('A source name is required.'),
    }),
    defineField({
      name: 'url',
      title: 'URL',
      type: 'url',
      description: 'Where the source can be found.',
      validation: (rule) =>
        rule.uri({scheme: ['http', 'https']}).error('Enter a valid http(s) URL.'),
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      rows: 3,
      description: 'What this source is about.',
    }),
    defineField({
      name: 'publisher',
      title: 'Publisher',
      type: 'string',
      description: 'Organization or imprint that published the source.',
    }),
    defineField({
      name: 'author',
      title: 'Author',
      type: 'string',
      description: 'Author or authors of the source.',
    }),
    defineField({
      name: 'publishedAt',
      title: 'Published date',
      type: 'datetime',
      description: 'When the source was published.',
    }),
    defineField({
      name: 'accessedAt',
      title: 'Accessed date',
      type: 'datetime',
      description: 'When the knowledge was last checked against this source.',
      validation: (rule) =>
        rule.custom((accessedAt, context) => {
          const publishedAt = (context.parent as {publishedAt?: string} | undefined)?.publishedAt
          if (publishedAt && accessedAt && accessedAt < publishedAt) {
            return 'Accessed date cannot be before published date.'
          }
          return true
        }),
    }),
    defineField({
      name: 'scope',
      title: 'Scope',
      type: 'text',
      rows: 3,
      description: 'What part of the knowledge base this source supports.',
    }),
    defineField({
      name: 'version',
      title: 'Version',
      type: 'string',
      description: 'Version of the source, when applicable.',
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
