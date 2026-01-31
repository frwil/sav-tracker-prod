<?php

namespace App\Doctrine;

use App\Entity\User;
use App\Entity\Visit;
use App\Entity\Customer;
use Doctrine\ORM\QueryBuilder;
use ApiPlatform\Metadata\Operation;
use Symfony\Bundle\SecurityBundle\Security;
use ApiPlatform\Doctrine\Orm\Util\QueryNameGeneratorInterface;
use ApiPlatform\Doctrine\Orm\Extension\QueryItemExtensionInterface;
use ApiPlatform\Doctrine\Orm\Extension\QueryCollectionExtensionInterface;

class CurrentUserExtension implements QueryCollectionExtensionInterface, QueryItemExtensionInterface
{
    public function __construct(private Security $security)
    {
    }

    public function applyToCollection(QueryBuilder $queryBuilder, QueryNameGeneratorInterface $queryNameGenerator, string $resourceClass, Operation $operation = null, array $context = []): void
    {
        $this->addWhere($queryBuilder, $resourceClass);
    }

    public function applyToItem(QueryBuilder $queryBuilder, QueryNameGeneratorInterface $queryNameGenerator, string $resourceClass, array $identifiers, Operation $operation = null, array $context = []): void
    {
        $this->addWhere($queryBuilder, $resourceClass);
    }

    private function addWhere(QueryBuilder $queryBuilder, string $resourceClass): void
    {
        // 1. On ne touche qu'à l'entité Visit
        if (Visit::class !== $resourceClass) {
            return;
        }

        // 2. Si c'est un Super Admin, on le laisse tout voir
        if ($this->security->isGranted('ROLE_SUPER_ADMIN')) {
            return;
        }

        if ($this->security->isGranted('ROLE_ADMIN') || 
            $this->security->isGranted('ROLE_SUPER_ADMIN') || 
            $this->security->isGranted('ROLE_OPERATOR')) {
            return;
        }

        // 3. On récupère l'utilisateur connecté
        $user = $this->security->getUser();
        if (null === $user) {
            return;
        }

        if (!$user instanceof User) {
            return;
        }

        // 4. On ajoute la condition WHERE technician = current_user
        $rootAlias = $queryBuilder->getRootAliases()[0];
        if ($resourceClass === Customer::class) {
            // AVANT : createdBy OR affectedTo
            // MAINTENANT : Seulement affectedTo
            $queryBuilder->andWhere(sprintf('%s.affectedTo = :current_user', $rootAlias));
            $queryBuilder->setParameter('current_user', $user);
        }

        // 3. Pour les visites, on garde l'historique (Je vois les visites que J'AI faites)
        if ($resourceClass === Visit::class) {
            $queryBuilder->andWhere(sprintf('%s.technician = :current_user', $rootAlias));
            $queryBuilder->setParameter('current_user', $user);
        }
    }
}