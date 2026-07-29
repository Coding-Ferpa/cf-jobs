'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'

import { alternarTaxonomia, salvarTaxonomia } from '@/actions/admin'
import type { ActionResult } from '@/actions/result'
import { ActionFeedback } from '@/components/admin/action-feedback'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import {
  KINDS_DE_TECNOLOGIA,
  taxonomiaSchema,
  type EntradaDeTaxonomia,
} from '@/lib/schemas/admin'

/**
 * CRUD de taxonomia com contagem de uso (doc 08). Ativar e desativar em vez de
 * apagar: vaga publicada que aponta para a taxonomia continua válida.
 */

type Linha = {
  id: string
  slug: string
  label: string
  aliases: string[]
  isActive: boolean
  usos: number
}

type Kind = EntradaDeTaxonomia['kind']

/** O enum do banco é em inglês; a interface é em pt-BR (doc 03). */
const ROTULO_DO_TIPO: Record<(typeof KINDS_DE_TECNOLOGIA)[number], string> = {
  language: 'Linguagem',
  framework: 'Framework',
  database: 'Banco de dados',
  cloud: 'Nuvem',
  tool: 'Ferramenta',
}

export function TaxonomyManager({ kind, linhas }: { kind: Kind; linhas: Linha[] }) {
  const router = useRouter()
  const [resultado, setResultado] = useState<ActionResult<unknown> | null>(null)
  const [pendente, iniciarTransicao] = useTransition()

  const form = useForm<EntradaDeTaxonomia>({
    resolver: zodResolver(taxonomiaSchema, undefined, { raw: true }),
    defaultValues: {
      kind,
      label: '',
      aliases: '',
      technologyKind: kind === 'technology' ? 'tool' : null,
      rank: kind === 'seniority' ? 0 : null,
      sortOrder: 0,
    },
  })

  async function enviar(valores: EntradaDeTaxonomia) {
    const resposta = await salvarTaxonomia({ ...valores, kind })
    setResultado(resposta)

    if (resposta.ok) {
      form.reset({
        kind,
        label: '',
        aliases: '',
        technologyKind: kind === 'technology' ? 'tool' : null,
        rank: kind === 'seniority' ? 0 : null,
        sortOrder: 0,
      })
      router.refresh()
    }
  }

  function alternar(id: string, isActive: boolean) {
    iniciarTransicao(async () => {
      const resposta = await alternarTaxonomia({ kind, id, isActive })
      setResultado(resposta)
      if (resposta.ok) router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <Form {...form}>
        <form
          className="border-border flex flex-col gap-4 rounded-md border p-4"
          onSubmit={form.handleSubmit(enviar)}
        >
          <h2 className="text-caption font-semibold">Novo registro</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rótulo</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormDescription>O slug sai daqui e não muda depois.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="sortOrder"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ordem</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      inputMode="numeric"
                      value={String(field.value ?? 0)}
                    />
                  </FormControl>
                  <FormDescription>Menor aparece primeiro no filtro.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {kind === 'technology' ? (
              <FormField
                control={form.control}
                name="technologyKind"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? 'tool'}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {KINDS_DE_TECNOLOGIA.map((tipo) => (
                          <SelectItem key={tipo} value={tipo}>
                            {ROTULO_DO_TIPO[tipo]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

            {kind === 'seniority' ? (
              <FormField
                control={form.control}
                name="rank"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rank</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        inputMode="numeric"
                        value={String(field.value ?? 0)}
                      />
                    </FormControl>
                    <FormDescription>De estágio (menor) a principal.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
          </div>

          <FormField
            control={form.control}
            name="aliases"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Sinônimos</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    rows={3}
                    value={
                      Array.isArray(field.value) ? field.value.join('\n') : field.value
                    }
                  />
                </FormControl>
                <FormDescription>
                  Um por linha. É o que a importação usa para reconhecer o termo no
                  anúncio.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={form.formState.isSubmitting} type="submit">
              Adicionar
            </Button>
            <ActionFeedback mensagemDeSucesso="Salvo." resultado={resultado} />
          </div>
        </form>
      </Form>

      <div className="border-border overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rótulo</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Sinônimos</TableHead>
              <TableHead className="text-right">Em uso</TableHead>
              <TableHead className="text-right">Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((linha) => (
              <TableRow
                className={linha.isActive ? undefined : 'opacity-60'}
                key={linha.id}
              >
                <TableCell className="font-medium">{linha.label}</TableCell>
                <TableCell className="text-muted-foreground font-mono text-xs">
                  {linha.slug}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {linha.aliases.length > 0 ? linha.aliases.join(', ') : '—'}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {linha.usos}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    disabled={pendente}
                    onClick={() => alternar(linha.id, !linha.isActive)}
                    size="sm"
                    variant="ghost"
                  >
                    {linha.isActive ? 'Desativar' : 'Reativar'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
