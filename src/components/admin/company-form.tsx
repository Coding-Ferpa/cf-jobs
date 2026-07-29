'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import { salvarEmpresa } from '@/actions/admin'
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
import { Textarea } from '@/components/ui/textarea'
import { empresaSchema, type EntradaDeEmpresa } from '@/lib/schemas/admin'

/** Cadastro de empresa (doc 06). O slug sai do nome e não muda depois. */
export function CompanyForm({
  empresa,
  aoSalvar,
}: {
  empresa?: EntradaDeEmpresa & { id: string }
  aoSalvar?: () => void
}) {
  const router = useRouter()
  const [resultado, setResultado] = useState<ActionResult<unknown> | null>(null)

  const form = useForm<EntradaDeEmpresa>({
    resolver: zodResolver(empresaSchema, undefined, { raw: true }),
    defaultValues: empresa ?? {
      name: '',
      website: '',
      logoUrl: '',
      description: '',
    },
  })

  async function enviar(valores: EntradaDeEmpresa) {
    const resposta = await salvarEmpresa(
      empresa ? { ...valores, id: empresa.id } : valores,
    )
    setResultado(resposta)

    if (resposta.ok) {
      if (!empresa) form.reset()
      router.refresh()
      aoSalvar?.()
    }
  }

  return (
    <Form {...form}>
      <form className="flex flex-col gap-4" onSubmit={form.handleSubmit(enviar)}>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Aurora Pagamentos" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="website"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Site</FormLabel>
                <FormControl>
                  <Input {...field} inputMode="url" value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="logoUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Logo</FormLabel>
                <FormControl>
                  <Input {...field} inputMode="url" value={field.value ?? ''} />
                </FormControl>
                <FormDescription>URL da imagem.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descrição</FormLabel>
              <FormControl>
                <Textarea {...field} rows={3} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={form.formState.isSubmitting} type="submit">
            {empresa ? 'Salvar' : 'Cadastrar empresa'}
          </Button>
          <ActionFeedback
            mensagemDeSucesso={empresa ? 'Empresa salva.' : 'Empresa cadastrada.'}
            resultado={resultado}
          />
        </div>
      </form>
    </Form>
  )
}
