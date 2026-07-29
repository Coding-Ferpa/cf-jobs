'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'

import { atualizarVaga, criarVaga } from '@/actions/jobs'
import type { ActionResult } from '@/actions/result'
import { ActionFeedback } from '@/components/admin/action-feedback'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  MOEDAS,
  PERIODOS_DE_SALARIO,
  vagaSchema,
  type EntradaDeVaga,
} from '@/lib/schemas/job'

/**
 * Formulário de vaga (doc 08): react-hook-form com o mesmo schema Zod da
 * Server Action, então a validação do cliente e a do servidor são a mesma
 * regra — o cliente só adianta a mensagem.
 */

type Opcao = { id: string; label: string }

export type OpcoesDoFormularioDeVaga = {
  empresas: Opcao[]
  cargos: Opcao[]
  senioridades: Opcao[]
  modalidades: Opcao[]
  contratacoes: Opcao[]
  tecnologias: Opcao[]
  etiquetas: Opcao[]
}

const ROTULO_DO_PERIODO: Record<(typeof PERIODOS_DE_SALARIO)[number], string> = {
  hour: 'por hora',
  month: 'por mês',
  year: 'por ano',
}

/** `<Select>` do Radix não aceita valor vazio; este sentinela representa "nenhum". */
const NENHUM = '__nenhum__'

function SelectDeTaxonomia({
  campo,
  opcoes,
  placeholder,
}: {
  campo: { value: string | null; onChange: (valor: string | null) => void }
  opcoes: Opcao[]
  placeholder: string
}) {
  return (
    <Select
      onValueChange={(valor) => campo.onChange(valor === NENHUM ? null : valor)}
      value={campo.value ?? NENHUM}
    >
      <FormControl>
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
      </FormControl>
      <SelectContent>
        <SelectItem value={NENHUM}>Não informado</SelectItem>
        {opcoes.map((opcao) => (
          <SelectItem key={opcao.id} value={opcao.id}>
            {opcao.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function ListaDeChips({
  titulo,
  opcoes,
  selecionados,
  aoAlternar,
  ajuda,
}: {
  titulo: string
  opcoes: Opcao[]
  selecionados: string[]
  aoAlternar: (id: string, marcado: boolean) => void
  ajuda?: string
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-caption mb-1 font-medium">{titulo}</legend>
      {ajuda ? <p className="text-muted-foreground text-xs">{ajuda}</p> : null}
      <div className="border-border max-h-56 overflow-y-auto rounded-md border p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {opcoes.map((opcao) => {
            const id = `${titulo}-${opcao.id}`
            return (
              <div className="flex items-center gap-2" key={opcao.id}>
                <Checkbox
                  checked={selecionados.includes(opcao.id)}
                  id={id}
                  onCheckedChange={(marcado) => aoAlternar(opcao.id, marcado === true)}
                />
                <Label className="text-caption font-normal" htmlFor={id}>
                  {opcao.label}
                </Label>
              </div>
            )
          })}
        </div>
      </div>
    </fieldset>
  )
}

export function JobForm({
  opcoes,
  vaga,
}: {
  opcoes: OpcoesDoFormularioDeVaga
  /** Ausente = criação. */
  vaga?: EntradaDeVaga & { id: string }
}) {
  const router = useRouter()
  const [resultado, setResultado] = useState<ActionResult<unknown> | null>(null)

  // `raw: true`: o schema transforma (o textarea vira array, "12.000,50" vira
  // "12000.50") e sem isso o formulário passaria a carregar o formato do banco.
  // A validação é a mesma do servidor — muda só quem aplica a transformação,
  // que fica sendo só a action.
  const form = useForm<EntradaDeVaga>({
    resolver: zodResolver(vagaSchema, undefined, { raw: true }),
    defaultValues: vaga ?? {
      title: '',
      companyId: '',
      descriptionMd: '',
      summary: '',
      roleCategoryId: null,
      seniorityId: null,
      workModeId: null,
      contractTypeId: null,
      locationCity: '',
      locationState: '',
      locationCountry: 'BR',
      salaryMin: '',
      salaryMax: '',
      salaryCurrency: 'BRL',
      salaryPeriod: 'month',
      benefits: '',
      keywords: '',
      language: 'pt-BR',
      sourceUrl: '',
      applyUrl: '',
      technologyIds: [],
      tagIds: [],
    },
  })

  async function enviar(valores: EntradaDeVaga) {
    const resposta = vaga
      ? await atualizarVaga({ ...valores, id: vaga.id })
      : await criarVaga(valores)

    setResultado(resposta)

    if (!resposta.ok) {
      // Erro por campo volta para o input que o causou (ex.: URL duplicada).
      for (const [campo, mensagens] of Object.entries(resposta.error.fieldErrors ?? {})) {
        form.setError(campo as keyof EntradaDeVaga, {
          message: mensagens.join(' '),
        })
      }
      return
    }

    const criada = resposta.data as { id: string }
    if (vaga) router.refresh()
    else router.push(`/admin/vagas/${criada.id}`)
  }

  // `useWatch` e não `form.watch`: o segundo devolve função nova a cada render
  // e o React Compiler não consegue memoizar o componente em volta.
  const tecnologias = useWatch({ control: form.control, name: 'technologyIds' }) ?? []
  const etiquetas = useWatch({ control: form.control, name: 'tagIds' }) ?? []

  return (
    <Form {...form}>
      <form className="flex flex-col gap-8" onSubmit={form.handleSubmit(enviar)}>
        <section className="flex flex-col gap-4">
          <h2 className="text-h3 font-semibold">Identificação</h2>

          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Título</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Pessoa Desenvolvedora Backend" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="companyId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Empresa</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || undefined}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Escolha a empresa" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {opcoes.empresas.map((empresa) => (
                      <SelectItem key={empresa.id} value={empresa.id}>
                        {empresa.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Não achou? Cadastre em Empresas e volte aqui.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="summary"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Resumo</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={2} value={field.value ?? ''} />
                </FormControl>
                <FormDescription>
                  Uma ou duas linhas. É o que vai na busca do Google e no card.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="descriptionMd"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Descrição</FormLabel>
                <FormControl>
                  <Textarea {...field} className="font-mono text-sm" rows={14} />
                </FormControl>
                <FormDescription>
                  Markdown. Títulos, listas e código são renderizados na página da vaga.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-h3 font-semibold">Classificação</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="roleCategoryId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cargo</FormLabel>
                  <SelectDeTaxonomia
                    campo={field}
                    opcoes={opcoes.cargos}
                    placeholder="Escolha o cargo"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="seniorityId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Senioridade</FormLabel>
                  <SelectDeTaxonomia
                    campo={field}
                    opcoes={opcoes.senioridades}
                    placeholder="Escolha a senioridade"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="workModeId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Modalidade</FormLabel>
                  <SelectDeTaxonomia
                    campo={field}
                    opcoes={opcoes.modalidades}
                    placeholder="Escolha a modalidade"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="contractTypeId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contratação</FormLabel>
                  <SelectDeTaxonomia
                    campo={field}
                    opcoes={opcoes.contratacoes}
                    placeholder="Escolha a contratação"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <ListaDeChips
            aoAlternar={(id, marcado) =>
              form.setValue(
                'technologyIds',
                marcado
                  ? [...tecnologias, id]
                  : tecnologias.filter((item) => item !== id),
                { shouldDirty: true },
              )
            }
            ajuda="A primeira marcada vira a tecnologia principal da vaga."
            opcoes={opcoes.tecnologias}
            selecionados={tecnologias}
            titulo="Tecnologias"
          />

          <ListaDeChips
            aoAlternar={(id, marcado) =>
              form.setValue(
                'tagIds',
                marcado ? [...etiquetas, id] : etiquetas.filter((item) => item !== id),
                { shouldDirty: true },
              )
            }
            opcoes={opcoes.etiquetas}
            selecionados={etiquetas}
            titulo="Tags"
          />
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-h3 font-semibold">Local e remuneração</h2>

          <div className="grid gap-4 sm:grid-cols-3">
            <FormField
              control={form.control}
              name="locationCity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cidade</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="locationState"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estado</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="SP" value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="locationCountry"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>País</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="BR" value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <FormField
              control={form.control}
              name="salaryMin"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Piso</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      inputMode="decimal"
                      placeholder="12000"
                      value={String(field.value ?? '')}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="salaryMax"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Teto</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      inputMode="decimal"
                      placeholder="18000"
                      value={String(field.value ?? '')}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="salaryCurrency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Moeda</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? undefined}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="BRL" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {MOEDAS.map((moeda) => (
                        <SelectItem key={moeda} value={moeda}>
                          {moeda}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="salaryPeriod"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Período</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? 'month'}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {PERIODOS_DE_SALARIO.map((periodo) => (
                        <SelectItem key={periodo} value={periodo}>
                          {ROTULO_DO_PERIODO[periodo]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-h3 font-semibold">Links e detalhes</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="sourceUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>URL do anúncio original</FormLabel>
                  <FormControl>
                    <Input {...field} inputMode="url" placeholder="https://…" />
                  </FormControl>
                  <FormDescription>
                    É a chave que impede a mesma vaga entrar duas vezes.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="applyUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>URL de candidatura</FormLabel>
                  <FormControl>
                    <Input {...field} inputMode="url" placeholder="https://…" />
                  </FormControl>
                  <FormDescription>Para onde o botão da vaga leva.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="benefits"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Benefícios</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={4}
                      value={
                        Array.isArray(field.value) ? field.value.join('\n') : field.value
                      }
                    />
                  </FormControl>
                  <FormDescription>Um por linha.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="keywords"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Palavras-chave</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={4}
                      value={
                        Array.isArray(field.value) ? field.value.join('\n') : field.value
                      }
                    />
                  </FormControl>
                  <FormDescription>Uma por linha. Ajuda a busca interna.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </section>

        <div className="border-border flex flex-wrap items-center gap-3 border-t pt-6">
          <Button disabled={form.formState.isSubmitting} type="submit">
            {vaga ? 'Salvar alterações' : 'Criar rascunho'}
          </Button>
          {!vaga ? (
            <p className="text-muted-foreground text-caption">
              A vaga nasce como rascunho. Publicar é o passo seguinte.
            </p>
          ) : null}
          <div className="w-full">
            <ActionFeedback
              mensagemDeSucesso="Alterações salvas."
              resultado={resultado}
            />
          </div>
        </div>
      </form>
    </Form>
  )
}
